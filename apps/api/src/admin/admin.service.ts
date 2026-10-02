import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { SettingsService } from '../settings/settings.service';
import { OrderStatus, fromCents, toCents } from '../common/domain';
import { UpdateConfigDto } from './dto/admin.dto';

const ACTIVE_STATUSES: string[] = [
  OrderStatus.PUBLICADA,
  OrderStatus.ACEPTADA,
  OrderStatus.COMPRANDO,
  OrderStatus.ESPERA_APROBACION,
  OrderStatus.EN_CAMINO,
  OrderStatus.ENTREGADA,
  OrderStatus.EN_DISPUTA,
];

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly settings: SettingsService,
  ) {}

  /** Métricas de operación para el dashboard. */
  async dashboard() {
    const [usersByRole, ordersByStatus, closed, platformWallet] =
      await Promise.all([
        this.prisma.user.groupBy({ by: ['role'], _count: true }),
        this.prisma.order.groupBy({ by: ['status'], _count: true }),
        this.prisma.order.findMany({
          where: { status: OrderStatus.CERRADA },
          select: { finalItemsCents: true, deliveryFeeCents: true },
        }),
        this.wallet.getPlatformWallet(),
      ]);

    const gmvCents = closed.reduce(
      (s, o) => s + (o.finalItemsCents ?? 0) + o.deliveryFeeCents,
      0,
    );
    const byStatus = Object.fromEntries(
      ordersByStatus.map((r) => [r.status, r._count]),
    );
    const activeOrders = ACTIVE_STATUSES.reduce(
      (s, st) => s + (byStatus[st] ?? 0),
      0,
    );
    const platformBalance = await this.wallet.getBalance(platformWallet.id);

    return {
      usersByRole: Object.fromEntries(
        usersByRole.map((r) => [r.role, r._count]),
      ),
      ordersByStatus: byStatus,
      activeOrders,
      completedOrders: closed.length,
      gmv: fromCents(gmvCents),
      platformEarnings: platformBalance.available,
      disputes: byStatus[OrderStatus.EN_DISPUTA] ?? 0,
    };
  }

  /** Lista de usuarios con su saldo (para gestión). */
  async listUsers(role?: string) {
    const users = await this.prisma.user.findMany({
      where: role ? { role } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { wallet: true },
    });
    const result = [];
    for (const u of users) {
      const balance = u.wallet
        ? await this.wallet.getBalance(u.wallet.id)
        : null;
      result.push({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        kycStatus: u.kycStatus,
        isActive: u.isActive,
        available: balance?.available ?? 0,
        frozen: balance?.frozen ?? 0,
      });
    }
    return result;
  }

  async setKyc(userId: string, status: string) {
    await this.ensureUser(userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: { kycStatus: status },
      select: { id: true, kycStatus: true },
    });
  }

  async setActive(userId: string, isActive: boolean) {
    await this.ensureUser(userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, isActive: true },
    });
  }

  /** Órdenes en disputa (bandeja del admin). */
  async listDisputes() {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.EN_DISPUTA },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return orders;
  }

  // ── Configuración (unidades legibles para la UI) ──

  async getConfigView() {
    const c = await this.settings.getConfig();
    return {
      commissionRate: c.commissionRate,
      deliveryFee: fromCents(c.deliveryFeeCents),
      tripBaseFare: fromCents(c.tripBaseFareCents),
      tripPerKm: fromCents(c.tripPerKmCents),
    };
  }

  async updateConfig(dto: UpdateConfigDto) {
    await this.settings.updateConfig({
      commissionRate: dto.commissionRate,
      deliveryFeeCents:
        dto.deliveryFee !== undefined ? toCents(dto.deliveryFee) : undefined,
      tripBaseFareCents:
        dto.tripBaseFare !== undefined ? toCents(dto.tripBaseFare) : undefined,
      tripPerKmCents:
        dto.tripPerKm !== undefined ? toCents(dto.tripPerKm) : undefined,
    });
    return this.getConfigView();
  }

  private async ensureUser(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('Usuario no encontrado');
  }
}
