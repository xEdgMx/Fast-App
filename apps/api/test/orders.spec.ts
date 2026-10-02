import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { WalletService } from '../src/wallet/wallet.service';
import { OrdersService } from '../src/orders/orders.service';
import { SettingsService } from '../src/settings/settings.service';
import {
  OrderItemStatus,
  OrderStatus,
  PLATFORM_EMAIL,
  Roles,
} from '../src/common/domain';

const DB_FILE = join(__dirname, '..', 'prisma', 'test.db');

describe('OrdersService — flujo de compra con escrow (Fase 2)', () => {
  let prisma: PrismaClient;
  let wallet: WalletService;
  let orders: OrdersService;
  let clienteId: string;
  let conductorId: string;

  beforeAll(() => {
    prisma = new PrismaClient({
      datasources: { db: { url: `file:${DB_FILE}` } },
    });
    wallet = new WalletService(prisma as never);
    // Gateway de tiempo real simulado (no emitimos sockets en pruebas).
    const realtimeStub = {
      orderUpdated: () => undefined,
      feedChanged: () => undefined,
      notifyUser: () => undefined,
    };
    const settings = new SettingsService(prisma as never);
    orders = new OrdersService(
      prisma as never,
      wallet,
      realtimeStub as never,
      settings,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.chatMessage.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.ledgerEntry.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.user.deleteMany();

    const cliente = await prisma.user.create({
      data: { email: 'c@test.local', name: 'C', role: 'CLIENTE', passwordHash: 'x', wallet: { create: {} } },
    });
    const conductor = await prisma.user.create({
      data: { email: 'd@test.local', name: 'D', role: 'CONDUCTOR', passwordHash: 'x', wallet: { create: {} } },
    });
    await prisma.user.create({
      data: { email: PLATFORM_EMAIL, name: 'P', role: 'ADMIN', passwordHash: 'x', wallet: { create: {} } },
    });
    clienteId = cliente.id;
    conductorId = conductor.id;
  });

  async function balances() {
    const c = await wallet.getBalanceByUser(clienteId);
    const d = await wallet.getBalanceByUser(conductorId);
    const platformUser = await prisma.user.findUnique({ where: { email: PLATFORM_EMAIL } });
    const p = await wallet.getBalance((await wallet.getWalletByUser(platformUser!.id)).id);
    return { c, d, p };
  }

  /** Crea, publica y hace que el conductor acepte y empiece a comprar. */
  async function openOrder(items: { name: string; qty: number; estUnitPrice: number }[]) {
    const draft = await orders.createDraft(clienteId, {
      deliveryAddress: 'Calle 1',
      items,
    });
    await orders.publish(clienteId, draft.id);
    await orders.accept(conductorId, draft.id);
    await orders.startShopping(conductorId, draft.id);
    return draft.id;
  }

  it('happy path: final = estimado → conductor cobra, plataforma comisiona, sin reembolso', async () => {
    await wallet.cashIn(clienteId, 100);
    const id = await openOrder([{ name: 'Leche', qty: 2, estUnitPrice: 1.5 }, { name: 'Pan', qty: 1, estUnitPrice: 2 }]);
    const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    for (const it of order!.items) {
      await orders.updateItem(conductorId, id, it.id, {
        status: OrderItemStatus.COMPRADO,
        realUnitPrice: it.estUnitCents / 100,
      });
    }
    await orders.finishShopping(conductorId, id);
    await orders.deliver(conductorId, id);
    const closed = await orders.confirmDelivery(clienteId, id);

    expect(closed.status).toBe(OrderStatus.CERRADA);
    const { c, d, p } = await balances();
    expect(c.available).toBe(93); // 100 - (5 items + 2 fee)
    expect(c.frozen).toBe(0);
    expect(d.available).toBe(6.6); // 5 + 2 - 0.4 comisión
    expect(p.available).toBe(0.4);
  });

  it('ticket MENOR al estimado → reembolsa el excedente al cliente', async () => {
    await wallet.cashIn(clienteId, 20);
    const id = await openOrder([{ name: 'Arroz', qty: 1, estUnitPrice: 10 }]);
    const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    // held = 10 + 2 = 12; compra real = 6
    await orders.updateItem(conductorId, id, order!.items[0].id, {
      status: OrderItemStatus.COMPRADO,
      realUnitPrice: 6,
    });
    const fin = await orders.finishShopping(conductorId, id);
    expect(fin.status).toBe(OrderStatus.EN_CAMINO);
    await orders.deliver(conductorId, id);
    await orders.confirmDelivery(clienteId, id);

    const { c, d, p } = await balances();
    // final total = 8; reembolso = 12 - 8 = 4
    expect(c.available).toBe(12); // 20 - 12 held + 4 reembolso = 12
    expect(d.available).toBe(7.6); // 6 + 2 - 0.4
    expect(p.available).toBe(0.4);
    expect(c.available + d.available + p.available).toBe(20); // conservación
  });

  it('ticket MAYOR al estimado → requiere aprobación de recarga extra', async () => {
    await wallet.cashIn(clienteId, 20);
    const id = await openOrder([{ name: 'Carne', qty: 1, estUnitPrice: 5 }]);
    const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    // held = 7; compra real = 9 → final 11 > 7
    await orders.updateItem(conductorId, id, order!.items[0].id, {
      status: OrderItemStatus.COMPRADO,
      realUnitPrice: 9,
    });
    const waiting = await orders.finishShopping(conductorId, id);
    expect(waiting.status).toBe(OrderStatus.ESPERA_APROBACION);
    expect(waiting.totals.pendingExtra).toBe(4); // 11 - 7

    // No se puede entregar antes de aprobar
    await expect(orders.deliver(conductorId, id)).rejects.toThrow();

    const approved = await orders.approveExtra(clienteId, id);
    expect(approved.status).toBe(OrderStatus.EN_CAMINO);
    await orders.deliver(conductorId, id);
    await orders.confirmDelivery(clienteId, id);

    const { c, d, p } = await balances();
    expect(d.available).toBe(10.6); // 9 + 2 - 0.4
    expect(p.available).toBe(0.4);
    expect(c.available).toBe(9); // 20 - 11
    expect(c.available + d.available + p.available).toBe(20);
  });

  it('producto AGOTADO → se excluye del total y se reembolsa', async () => {
    await wallet.cashIn(clienteId, 20);
    const id = await openOrder([
      { name: 'A', qty: 1, estUnitPrice: 5 },
      { name: 'B', qty: 1, estUnitPrice: 3 },
    ]);
    const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    // held = 8 + 2 = 10
    await orders.updateItem(conductorId, id, order!.items[0].id, { status: OrderItemStatus.COMPRADO, realUnitPrice: 5 });
    await orders.updateItem(conductorId, id, order!.items[1].id, { status: OrderItemStatus.AGOTADO });
    await orders.finishShopping(conductorId, id);
    await orders.deliver(conductorId, id);
    await orders.confirmDelivery(clienteId, id);

    const { c, d, p } = await balances();
    // final = 5 + 2 = 7; reembolso = 10 - 7 = 3
    expect(d.available).toBe(6.6); // 5 + 2 - 0.4
    expect(c.available).toBe(13); // 20 - 10 + 3
    expect(p.available).toBe(0.4);
  });

  it('cancelación antes de comprar → reembolso total del escrow', async () => {
    await wallet.cashIn(clienteId, 20);
    const draft = await orders.createDraft(clienteId, { deliveryAddress: 'x', items: [{ name: 'X', qty: 1, estUnitPrice: 5 }] });
    await orders.publish(clienteId, draft.id);
    let bal = await wallet.getBalanceByUser(clienteId);
    expect(bal.frozen).toBe(7);

    const cancelled = await orders.cancel({ id: clienteId, email: 'c@test.local', role: Roles.CLIENTE }, draft.id);
    expect(cancelled.status).toBe(OrderStatus.CANCELADA);
    bal = await wallet.getBalanceByUser(clienteId);
    expect(bal.available).toBe(20);
    expect(bal.frozen).toBe(0);
  });

  it('VIAJE (mototaxi): se cobra la tarifa, el conductor cobra menos comisión', async () => {
    await wallet.cashIn(clienteId, 50);
    // Dos puntos ~ conocidos; la tarifa = base 1.50 + 0.80/km.
    const draft = await orders.createTripDraft(clienteId, {
      originAddress: 'A', originLat: 10.5, originLng: -66.9,
      destAddress: 'B', destLat: 10.5, destLng: -66.9, // misma coord → distancia 0
    });
    expect(draft.type).toBe('VIAJE');
    expect(draft.totals.estimatedTotal).toBe(1.5); // solo banderazo (0 km)

    await orders.publish(clienteId, draft.id);
    await orders.accept(conductorId, draft.id);
    await orders.startTrip(conductorId, draft.id);
    await orders.deliver(conductorId, draft.id);
    await orders.confirmDelivery(clienteId, draft.id);

    const { c, d, p } = await balances();
    // tarifa 1.50; comisión = 20% de 1.50 = 0.30; conductor = 1.20
    expect(d.available).toBe(1.2);
    expect(p.available).toBe(0.3);
    expect(c.available).toBe(48.5); // 50 - 1.50
  });

  it('un VIAJE no admite el flujo de compra (start-shopping)', async () => {
    await wallet.cashIn(clienteId, 50);
    const draft = await orders.createTripDraft(clienteId, {
      originAddress: 'A', originLat: 10.5, originLng: -66.9,
      destAddress: 'B', destLat: 10.52, destLng: -66.92,
    });
    await orders.publish(clienteId, draft.id);
    await orders.accept(conductorId, draft.id);
    await expect(orders.startShopping(conductorId, draft.id)).rejects.toThrow('viaje');
  });

  it('disputa resuelta a favor del CONDUCTOR (RELEASE) paga menos comisión', async () => {
    await wallet.cashIn(clienteId, 50);
    const draft = await orders.createDraft(clienteId, { deliveryAddress: 'x', items: [{ name: 'X', qty: 1, estUnitPrice: 5 }] });
    await orders.publish(clienteId, draft.id); // held = 7
    await orders.accept(conductorId, draft.id);
    await orders.openDispute({ id: clienteId, email: 'c@test.local', role: Roles.CLIENTE }, draft.id);
    const resolved = await orders.adminResolveDispute(draft.id, 'RELEASE');
    expect(resolved.status).toBe(OrderStatus.CERRADA);

    const { c, d, p } = await balances();
    expect(d.available).toBe(6.6); // 7 - 0.4 comisión
    expect(p.available).toBe(0.4);
    expect(c.available).toBe(43); // 50 - 7
  });

  it('disputa resuelta a favor del CLIENTE (REFUND) devuelve todo el escrow', async () => {
    await wallet.cashIn(clienteId, 50);
    const draft = await orders.createDraft(clienteId, { deliveryAddress: 'x', items: [{ name: 'X', qty: 1, estUnitPrice: 5 }] });
    await orders.publish(clienteId, draft.id);
    await orders.accept(conductorId, draft.id);
    await orders.openDispute({ id: clienteId, email: 'c@test.local', role: Roles.CLIENTE }, draft.id);
    const resolved = await orders.adminResolveDispute(draft.id, 'REFUND');
    expect(resolved.status).toBe(OrderStatus.CANCELADA);

    const { c, d } = await balances();
    expect(c.available).toBe(50);
    expect(d.available).toBe(0);
  });

  it('publicar sin fondos suficientes → se rechaza y no congela nada', async () => {
    await wallet.cashIn(clienteId, 3);
    const draft = await orders.createDraft(clienteId, { deliveryAddress: 'x', items: [{ name: 'X', qty: 1, estUnitPrice: 5 }] });
    await expect(orders.publish(clienteId, draft.id)).rejects.toThrow('Fondos insuficientes');
    const bal = await wallet.getBalanceByUser(clienteId);
    expect(bal.available).toBe(3);
    expect(bal.frozen).toBe(0);
  });
});
