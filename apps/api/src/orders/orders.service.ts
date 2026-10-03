import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import {
  LedgerType,
  OrderItemStatus,
  OrderStatus,
  OrderType,
  PURCHASED_ITEM_STATUSES,
  Roles,
  haversineKm,
  toCents,
} from '../common/domain';
import { AuthUser } from '../common/current-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';

/** groupId estable para agrupar todos los movimientos de escrow de una orden. */
const escrowGroup = (orderId: string) => `order:${orderId}`;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly realtime: RealtimeGateway,
    private readonly settings: SettingsService,
  ) {}

  /** Emite los eventos de tiempo real y devuelve la orden con totales. */
  private publishEvents<T extends { id: string } & OrderShape>(
    updated: T,
    opts: { feed?: boolean } = {},
  ) {
    this.realtime.orderUpdated({ id: updated.id });
    if (opts.feed) this.realtime.feedChanged();
    return this.withTotals(updated);
  }

  // ───────────────────────── Cliente ─────────────────────────

  /** Crea la orden en borrador con su estimación (sin congelar fondos todavía). */
  async createDraft(clienteId: string, dto: CreateOrderDto) {
    const feeCents =
      dto.deliveryFee !== undefined
        ? toCents(dto.deliveryFee)
        : (await this.settings.getConfig()).deliveryFeeCents;

    const items = dto.items.map((i) => ({
      name: i.name,
      qty: i.qty,
      estUnitCents: i.estUnitPrice !== undefined ? toCents(i.estUnitPrice) : 0,
    }));

    // Modo presupuesto: el cliente dice cuánto piensa gastar (sin precios unitarios).
    // Modo itemizado: se suma precio unitario × cantidad.
    const estimatedItemsCents =
      dto.budget !== undefined
        ? toCents(dto.budget)
        : items.reduce((sum, i) => sum + i.estUnitCents * i.qty, 0);

    const order = await this.prisma.order.create({
      data: {
        type: OrderType.COMPRA,
        status: OrderStatus.CREADA,
        clienteId,
        deliveryAddress: dto.deliveryAddress,
        originAddress: dto.storeName, // reutilizamos originAddress para el comercio
        notes: dto.category
          ? `[${dto.category}] ${dto.notes ?? ''}`.trim()
          : dto.notes,
        deliveryFeeCents: feeCents,
        estimatedItemsCents,
        items: { create: items },
      },
      include: { items: true },
    });

    return this.withTotals(order);
  }

  // ───────────────────────── Viajes (mototaxi, Fase 4) ─────────────────────────

  /** Distancia a usar: la real por calles (si el mapa la calculó) o la línea recta. */
  private resolveDistanceKm(dto: CreateTripDto): number {
    if (dto.distanceKm && dto.distanceKm > 0) return dto.distanceKm;
    return haversineKm(dto.originLat, dto.originLng, dto.destLat, dto.destLng);
  }

  /** Estima distancia y tarifa de un viaje sin crearlo. */
  async estimateTrip(dto: CreateTripDto) {
    const distanceKm = this.resolveDistanceKm(dto);
    const fareCents = await this.settings.tripFareCents(distanceKm);
    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      fare: fareCents / 100,
    };
  }

  /** Crea un viaje en borrador con su tarifa (mismo escrow que una compra). */
  async createTripDraft(clienteId: string, dto: CreateTripDto) {
    const distanceKm = this.resolveDistanceKm(dto);
    const fareCents = await this.settings.tripFareCents(distanceKm);

    const order = await this.prisma.order.create({
      data: {
        type: OrderType.VIAJE,
        status: OrderStatus.CREADA,
        clienteId,
        deliveryAddress: dto.destAddress,
        originAddress: dto.originAddress,
        originLat: dto.originLat,
        originLng: dto.originLng,
        destLat: dto.destLat,
        destLng: dto.destLng,
        distanceKm,
        notes: dto.notes,
        deliveryFeeCents: fareCents, // la tarifa es el "fee" del viaje
        estimatedItemsCents: 0,
        finalItemsCents: 0, // un viaje no tiene productos
      },
      include: { items: true },
    });
    return this.withTotals(order);
  }

  /** El conductor inicia el viaje (equivalente a start-shopping para VIAJE). */
  async startTrip(conductorId: string, orderId: string) {
    const order = await this.loadAsDriver(orderId, conductorId);
    if (order.type !== OrderType.VIAJE) {
      throw new BadRequestException('Esta orden no es un viaje');
    }
    if (order.status !== OrderStatus.ACEPTADA) {
      throw new BadRequestException('El viaje no está listo para iniciar');
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.EN_CAMINO },
      include: { items: true },
    });
    return this.publishEvents(updated);
  }

  /** Lanza la orden al feed: congela (HOLD) el total estimado en escrow. */
  async publish(clienteId: string, orderId: string) {
    const order = await this.loadAsClient(orderId, clienteId);
    if (order.status !== OrderStatus.CREADA) {
      throw new BadRequestException('La orden ya fue publicada o procesada');
    }
    const total = order.estimatedItemsCents + order.deliveryFeeCents;
    const clientWallet = await this.wallet.getWalletByUser(clienteId);

    await this.wallet.postTransaction(
      [
        {
          walletId: clientWallet.id,
          type: LedgerType.HOLD,
          amountCents: total,
          availableDelta: -total,
          frozenDelta: +total,
          orderId: order.id,
          memo: `Escrow orden ${order.id}`,
        },
      ],
      escrowGroup(order.id),
    );

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.PUBLICADA,
        heldCents: total,
        escrowGroupId: escrowGroup(order.id),
      },
      include: { items: true },
    });
    return this.publishEvents(updated, { feed: true });
  }

  /** Cliente aprueba la recarga extra cuando el ticket superó la estimación. */
  async approveExtra(clienteId: string, orderId: string) {
    const order = await this.loadAsClient(orderId, clienteId);
    if (order.status !== OrderStatus.ESPERA_APROBACION) {
      throw new BadRequestException('Esta orden no espera una recarga extra');
    }
    const extra = order.pendingExtraCents;
    const clientWallet = await this.wallet.getWalletByUser(clienteId);

    await this.wallet.postTransaction(
      [
        {
          walletId: clientWallet.id,
          type: LedgerType.HOLD,
          amountCents: extra,
          availableDelta: -extra,
          frozenDelta: +extra,
          orderId: order.id,
          memo: `Recarga extra orden ${order.id}`,
        },
      ],
      escrowGroup(order.id),
    );

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        heldCents: order.heldCents + extra,
        pendingExtraCents: 0,
        status: OrderStatus.EN_CAMINO,
      },
      include: { items: true },
    });
    return this.publishEvents(updated);
  }

  /** Cliente confirma la entrega → libera el escrow (RELEASE). */
  async confirmDelivery(clienteId: string, orderId: string) {
    const order = await this.loadAsClient(orderId, clienteId);
    if (order.status !== OrderStatus.ENTREGADA) {
      throw new BadRequestException(
        'Solo puedes confirmar una orden marcada como entregada',
      );
    }
    if (order.finalItemsCents === null || order.conductorId === null) {
      throw new BadRequestException('La orden no tiene datos de liquidación');
    }

    const held = order.heldCents;
    const fee = order.deliveryFeeCents;
    const finalItems = order.finalItemsCents;
    const finalTotal = finalItems + fee;
    const { commissionRate } = await this.settings.getConfig();
    const commission = Math.round(fee * commissionRate);
    const payout = finalItems + fee - commission; // reembolso al conductor + su ganancia
    const refund = held - finalTotal; // excedente que vuelve al cliente (>= 0)

    const clientWallet = await this.wallet.getWalletByUser(clienteId);
    const driverWallet = await this.wallet.getWalletByUser(order.conductorId);
    const platformWallet = await this.wallet.getPlatformWallet();

    await this.wallet.postTransaction(
      [
        {
          // Sale todo el escrow del cliente; su excedente vuelve a disponible.
          walletId: clientWallet.id,
          type: LedgerType.RELEASE,
          amountCents: held,
          availableDelta: refund,
          frozenDelta: -held,
          orderId: order.id,
          memo: `Liberación escrow orden ${order.id}`,
        },
        {
          walletId: driverWallet.id,
          type: LedgerType.PAYOUT,
          amountCents: payout,
          availableDelta: +payout,
          frozenDelta: 0,
          orderId: order.id,
          memo: `Pago al conductor orden ${order.id}`,
        },
        {
          walletId: platformWallet.id,
          type: LedgerType.FEE,
          amountCents: commission,
          availableDelta: +commission,
          frozenDelta: 0,
          orderId: order.id,
          memo: `Comisión orden ${order.id}`,
        },
      ],
      escrowGroup(order.id),
    );

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.CERRADA,
        heldCents: 0,
        completedAt: new Date(),
      },
      include: { items: true },
    });
    if (order.conductorId) {
      this.realtime.notifyUser(
        order.conductorId,
        `Pago liberado 💸 +Bs. ${(payout / 100).toFixed(2)}`,
        'success',
      );
    }
    return this.publishEvents(updated);
  }

  /** Cancela la orden y devuelve el escrow al cliente (solo antes de comprar). */
  async cancel(user: AuthUser, orderId: string) {
    const order = await this.loadParticipant(orderId, user);
    const cancelable: string[] = [
      OrderStatus.CREADA,
      OrderStatus.PUBLICADA,
      OrderStatus.ACEPTADA,
    ];
    if (!cancelable.includes(order.status)) {
      throw new BadRequestException(
        'No se puede cancelar: el conductor ya está comprando o la orden está cerrada',
      );
    }

    if (order.heldCents > 0) {
      const clientWallet = await this.wallet.getWalletByUser(order.clienteId);
      await this.wallet.postTransaction(
        [
          {
            walletId: clientWallet.id,
            type: LedgerType.REFUND,
            amountCents: order.heldCents,
            availableDelta: +order.heldCents,
            frozenDelta: -order.heldCents,
            orderId: order.id,
            memo: `Reembolso por cancelación orden ${order.id}`,
          },
        ],
        escrowGroup(order.id),
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.CANCELADA,
        heldCents: 0,
        cancelledAt: new Date(),
      },
      include: { items: true },
    });
    return this.publishEvents(updated, { feed: true });
  }

  /** Un participante abre una disputa; queda a la espera de resolución del admin. */
  async openDispute(user: AuthUser, orderId: string) {
    const order = await this.loadParticipant(orderId, user);
    const disputable: string[] = [
      OrderStatus.ACEPTADA,
      OrderStatus.COMPRANDO,
      OrderStatus.ESPERA_APROBACION,
      OrderStatus.EN_CAMINO,
      OrderStatus.ENTREGADA,
    ];
    if (!disputable.includes(order.status)) {
      throw new BadRequestException(
        'La orden no está en un estado que permita disputa',
      );
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.EN_DISPUTA },
      include: { items: true },
    });
    return this.publishEvents(updated);
  }

  /**
   * El admin resuelve una disputa:
   *  - REFUND: devuelve todo el escrow al cliente (orden CANCELADA).
   *  - RELEASE: paga al conductor (escrow − comisión) y cierra (orden CERRADA).
   */
  async adminResolveDispute(orderId: string, resolution: 'RELEASE' | 'REFUND') {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status !== OrderStatus.EN_DISPUTA) {
      throw new BadRequestException('La orden no está en disputa');
    }
    const held = order.heldCents;

    if (resolution === 'REFUND') {
      if (held > 0) {
        const clientWallet = await this.wallet.getWalletByUser(order.clienteId);
        await this.wallet.postTransaction(
          [
            {
              walletId: clientWallet.id,
              type: LedgerType.REFUND,
              amountCents: held,
              availableDelta: +held,
              frozenDelta: -held,
              orderId: order.id,
              memo: `Disputa resuelta a favor del cliente (orden ${order.id})`,
            },
          ],
          escrowGroup(order.id),
        );
      }
      const updated = await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELADA,
          heldCents: 0,
          cancelledAt: new Date(),
        },
        include: { items: true },
      });
      return this.publishEvents(updated);
    }

    // RELEASE
    if (!order.conductorId) {
      throw new BadRequestException(
        'No se puede liberar: la orden no tiene conductor',
      );
    }
    const { commissionRate } = await this.settings.getConfig();
    const commission = Math.round(order.deliveryFeeCents * commissionRate);
    const payout = held - commission;

    const clientWallet = await this.wallet.getWalletByUser(order.clienteId);
    const driverWallet = await this.wallet.getWalletByUser(order.conductorId);
    const platformWallet = await this.wallet.getPlatformWallet();

    await this.wallet.postTransaction(
      [
        {
          walletId: clientWallet.id,
          type: LedgerType.RELEASE,
          amountCents: held,
          availableDelta: 0,
          frozenDelta: -held,
          orderId: order.id,
          memo: `Disputa resuelta a favor del conductor (orden ${order.id})`,
        },
        {
          walletId: driverWallet.id,
          type: LedgerType.PAYOUT,
          amountCents: payout,
          availableDelta: +payout,
          frozenDelta: 0,
          orderId: order.id,
          memo: `Pago por disputa (orden ${order.id})`,
        },
        {
          walletId: platformWallet.id,
          type: LedgerType.FEE,
          amountCents: commission,
          availableDelta: +commission,
          frozenDelta: 0,
          orderId: order.id,
          memo: `Comisión por disputa (orden ${order.id})`,
        },
      ],
      escrowGroup(order.id),
    );

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.CERRADA,
        heldCents: 0,
        completedAt: new Date(),
      },
      include: { items: true },
    });
    return this.publishEvents(updated);
  }

  async listMine(clienteId: string) {
    const orders = await this.prisma.order.findMany({
      where: { clienteId },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return orders.map((o) => this.withTotals(o));
  }

  // ───────────────────────── Conductor ─────────────────────────

  /** Feed de órdenes publicadas y sin asignar. */
  async feed() {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.PUBLICADA, conductorId: null },
      orderBy: { createdAt: 'asc' },
      include: { items: true },
    });
    return orders.map((o) => this.withTotals(o));
  }

  /** Órdenes activas asignadas a un conductor (su trabajo en curso). */
  async listAssigned(conductorId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        conductorId,
        status: {
          notIn: [OrderStatus.CERRADA, OrderStatus.CANCELADA],
        },
      },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return orders.map((o) => this.withTotals(o));
  }

  async accept(conductorId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status !== OrderStatus.PUBLICADA || order.conductorId) {
      throw new BadRequestException('La orden ya no está disponible');
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        conductorId,
        status: OrderStatus.ACEPTADA,
        acceptedAt: new Date(),
      },
      include: { items: true },
    });
    this.realtime.notifyUser(
      updated.clienteId,
      updated.type === OrderType.VIAJE
        ? 'Un conductor aceptó tu viaje 🏍️'
        : 'Un shopper tomó tu pedido 🛒',
    );
    return this.publishEvents(updated, { feed: true });
  }

  async startShopping(conductorId: string, orderId: string) {
    const order = await this.loadAsDriver(orderId, conductorId);
    if (order.type !== OrderType.COMPRA) {
      throw new BadRequestException('Esta orden es un viaje, no una compra');
    }
    if (order.status !== OrderStatus.ACEPTADA) {
      throw new BadRequestException('La orden no está lista para comprar');
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.COMPRANDO },
      include: { items: true },
    });
    return this.publishEvents(updated);
  }

  /** El conductor registra el resultado de cada producto en la caja. */
  async updateItem(
    conductorId: string,
    orderId: string,
    itemId: string,
    dto: UpdateItemDto,
  ) {
    const order = await this.loadAsDriver(orderId, conductorId);
    if (
      order.status !== OrderStatus.COMPRANDO &&
      order.status !== OrderStatus.ACEPTADA
    ) {
      throw new BadRequestException('La orden no está en fase de compra');
    }
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException('Producto no encontrado');

    const needsPrice =
      dto.status === OrderItemStatus.COMPRADO ||
      dto.status === OrderItemStatus.REEMPLAZADO;
    if (needsPrice && dto.realUnitPrice === undefined) {
      throw new BadRequestException(
        'Indica el precio real del producto comprado',
      );
    }

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: {
        status: dto.status,
        realUnitCents:
          dto.realUnitPrice !== undefined ? toCents(dto.realUnitPrice) : null,
        name: dto.name ?? item.name,
      },
    });

    const reloaded = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    return this.publishEvents(reloaded!);
  }

  /**
   * El conductor termina la compra. Calcula el total real y decide:
   *  - si supera el escrow → ESPERA_APROBACION (recarga extra del cliente)
   *  - si no → EN_CAMINO (el excedente se reembolsa al confirmar)
   */
  async finishShopping(
    conductorId: string,
    orderId: string,
    finalItemsTotal?: number,
  ) {
    const order = await this.loadAsDriver(orderId, conductorId);
    if (order.status !== OrderStatus.COMPRANDO) {
      throw new BadRequestException('La orden no está en fase de compra');
    }

    let finalItemsCents: number;

    if (finalItemsTotal !== undefined) {
      // Modo presupuesto: el conductor ingresa el total real del ticket.
      if (finalItemsTotal < 0) {
        throw new BadRequestException('Total inválido');
      }
      finalItemsCents = toCents(finalItemsTotal);
    } else {
      // Modo itemizado: se suma el precio real de cada producto marcado.
      const items = await this.prisma.orderItem.findMany({
        where: { orderId },
      });
      const pending = items.filter(
        (i) => i.status === OrderItemStatus.PENDIENTE,
      );
      if (pending.length > 0) {
        throw new BadRequestException(
          'Hay productos sin marcar (comprado / agotado / reemplazado)',
        );
      }
      finalItemsCents = 0;
      for (const i of items) {
        if (PURCHASED_ITEM_STATUSES.includes(i.status)) {
          if (i.realUnitCents === null) {
            throw new BadRequestException(`Falta el precio real de "${i.name}"`);
          }
          finalItemsCents += i.realUnitCents * i.qty;
        }
      }
    }

    const finalTotal = finalItemsCents + order.deliveryFeeCents;
    const needsExtra = finalTotal > order.heldCents;

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        finalItemsCents,
        pendingExtraCents: needsExtra ? finalTotal - order.heldCents : 0,
        status: needsExtra
          ? OrderStatus.ESPERA_APROBACION
          : OrderStatus.EN_CAMINO,
      },
      include: { items: true },
    });
    return this.publishEvents(updated);
  }

  async deliver(conductorId: string, orderId: string) {
    const order = await this.loadAsDriver(orderId, conductorId);
    if (order.status !== OrderStatus.EN_CAMINO) {
      throw new BadRequestException(
        'La orden debe estar EN_CAMINO para marcarla entregada',
      );
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.ENTREGADA },
      include: { items: true },
    });
    this.realtime.notifyUser(
      updated.clienteId,
      'Entregado ✅ Confirma para liberar el pago',
    );
    return this.publishEvents(updated);
  }

  // ───────────────────────── Chat ─────────────────────────

  async addMessage(user: AuthUser, orderId: string, text: string) {
    await this.loadParticipant(orderId, user);
    return this.prisma.chatMessage.create({
      data: { orderId, fromUserId: user.id, text },
    });
  }

  async listMessages(user: AuthUser, orderId: string) {
    await this.loadParticipant(orderId, user);
    return this.prisma.chatMessage.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Últimos puntos de tracking de una orden (para pintar el mapa al abrir). */
  async listTracking(user: AuthUser, orderId: string) {
    await this.loadParticipant(orderId, user);
    return this.prisma.trackingPoint.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ───────────────────────── Común / Admin ─────────────────────────

  async getOne(user: AuthUser, orderId: string) {
    const order = await this.loadParticipant(orderId, user);
    return this.withTotals(order);
  }

  async listAll() {
    const orders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return orders.map((o) => this.withTotals(o));
  }

  // ───────────────────────── Helpers ─────────────────────────

  private async loadAsClient(orderId: string, clienteId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.clienteId !== clienteId) {
      throw new ForbiddenException('No es tu orden');
    }
    return order;
  }

  private async loadAsDriver(orderId: string, conductorId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.conductorId !== conductorId) {
      throw new ForbiddenException('No tienes esta orden asignada');
    }
    return order;
  }

  private async loadParticipant(orderId: string, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    const isParticipant =
      order.clienteId === user.id ||
      order.conductorId === user.id ||
      user.role === Roles.ADMIN;
    if (!isParticipant) {
      throw new ForbiddenException('No tienes acceso a esta orden');
    }
    return order;
  }

  /** Añade totales legibles (en unidades de moneda) a la respuesta. */
  private withTotals<T extends OrderShape>(order: T) {
    const estTotal = order.estimatedItemsCents + order.deliveryFeeCents;
    const finalTotal =
      order.finalItemsCents !== null
        ? order.finalItemsCents + order.deliveryFeeCents
        : null;
    return {
      ...order,
      totals: {
        estimatedItems: order.estimatedItemsCents / 100,
        deliveryFee: order.deliveryFeeCents / 100,
        estimatedTotal: estTotal / 100,
        finalItems:
          order.finalItemsCents !== null ? order.finalItemsCents / 100 : null,
        finalTotal: finalTotal !== null ? finalTotal / 100 : null,
        held: order.heldCents / 100,
        pendingExtra: order.pendingExtraCents / 100,
      },
    };
  }
}

interface OrderShape {
  estimatedItemsCents: number;
  deliveryFeeCents: number;
  finalItemsCents: number | null;
  heldCents: number;
  pendingExtraCents: number;
}
