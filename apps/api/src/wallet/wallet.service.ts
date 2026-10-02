import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  LedgerType,
  PLATFORM_EMAIL,
  fromCents,
  toCents,
} from '../common/domain';

/** Una "pata" de una transacción del ledger. */
export interface LedgerLeg {
  walletId: string;
  type: string;
  amountCents: number;
  availableDelta: number;
  frozenDelta: number;
  orderId?: string;
  memo?: string;
}

export interface Balance {
  availableCents: number;
  frozenCents: number;
  totalCents: number;
  available: number;
  frozen: number;
  total: number;
}

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /** Garantiza que el usuario tenga wallet (la crea si falta). */
  async getWalletByUser(userId: string) {
    const existing = await this.prisma.wallet.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.wallet.create({ data: { userId } });
  }

  /** Wallet interna de la plataforma donde se acumulan las comisiones. */
  async getPlatformWallet() {
    const platform = await this.prisma.user.findUnique({
      where: { email: PLATFORM_EMAIL },
    });
    if (!platform) {
      throw new NotFoundException(
        'Falta el usuario-plataforma. Ejecuta el seed (prisma/seed.ts).',
      );
    }
    return this.getWalletByUser(platform.id);
  }

  /** Saldo derivado del ledger (nunca almacenado). */
  async getBalance(walletId: string): Promise<Balance> {
    const agg = await this.prisma.ledgerEntry.aggregate({
      where: { walletId },
      _sum: { availableDelta: true, frozenDelta: true },
    });
    const availableCents = agg._sum.availableDelta ?? 0;
    const frozenCents = agg._sum.frozenDelta ?? 0;
    const totalCents = availableCents + frozenCents;
    return {
      availableCents,
      frozenCents,
      totalCents,
      available: fromCents(availableCents),
      frozen: fromCents(frozenCents),
      total: fromCents(totalCents),
    };
  }

  async getBalanceByUser(userId: string): Promise<Balance> {
    const wallet = await this.getWalletByUser(userId);
    return this.getBalance(wallet.id);
  }

  /**
   * Registra atómicamente una o varias patas como UNA transacción del ledger.
   * Tras aplicarlas, verifica el invariante: ningún saldo (disponible/congelado)
   * puede quedar negativo. Si falla, se revierte todo.
   * Base reutilizable para el escrow de la Fase 2 (hold/release/refund).
   */
  async postTransaction(legs: LedgerLeg[], groupId: string = randomUUID()) {
    if (legs.length === 0) {
      throw new BadRequestException('Transacción sin movimientos');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const leg of legs) {
        await tx.ledgerEntry.create({
          data: {
            walletId: leg.walletId,
            type: leg.type,
            amountCents: leg.amountCents,
            availableDelta: leg.availableDelta,
            frozenDelta: leg.frozenDelta,
            groupId,
            orderId: leg.orderId,
            memo: leg.memo,
          },
        });
      }

      // Invariante: revalidar saldos de cada wallet afectada dentro de la tx.
      const walletIds = [...new Set(legs.map((l) => l.walletId))];
      for (const walletId of walletIds) {
        const agg = await tx.ledgerEntry.aggregate({
          where: { walletId },
          _sum: { availableDelta: true, frozenDelta: true },
        });
        const available = agg._sum.availableDelta ?? 0;
        const frozen = agg._sum.frozenDelta ?? 0;
        if (available < 0 || frozen < 0) {
          // Lanzar revierte toda la transacción.
          throw new BadRequestException('Fondos insuficientes');
        }
      }

      return { groupId };
    });
  }

  /** Acredita un fondeo ya confirmado por la pasarela (montos en céntimos). */
  async creditCashIn(userId: string, amountCents: number, memo?: string) {
    const wallet = await this.getWalletByUser(userId);
    await this.postTransaction([
      {
        walletId: wallet.id,
        type: LedgerType.CASH_IN,
        amountCents,
        availableDelta: amountCents,
        frozenDelta: 0,
        memo: memo ?? 'Fondeo confirmado',
      },
    ]);
    return this.getBalance(wallet.id);
  }

  /** Debita un retiro (cash-out). El invariante impide dejar el saldo negativo. */
  async debitCashOut(userId: string, amountCents: number, memo?: string) {
    const wallet = await this.getWalletByUser(userId);
    await this.postTransaction([
      {
        walletId: wallet.id,
        type: LedgerType.CASH_OUT,
        amountCents,
        availableDelta: -amountCents,
        frozenDelta: 0,
        memo: memo ?? 'Retiro a Pago Móvil',
      },
    ]);
    return this.getBalance(wallet.id);
  }

  /** Fondeo de la wallet (cash-in). En producción lo dispara la pasarela de pago. */
  async cashIn(userId: string, amount: number, memo?: string) {
    const cents = toCents(amount);
    if (cents <= 0) {
      throw new BadRequestException('El monto debe ser mayor a 0');
    }
    const wallet = await this.getWalletByUser(userId);

    await this.postTransaction([
      {
        walletId: wallet.id,
        type: LedgerType.CASH_IN,
        amountCents: cents,
        availableDelta: cents,
        frozenDelta: 0,
        memo: memo ?? 'Fondeo de wallet (simulado)',
      },
    ]);

    return {
      wallet: { id: wallet.id, userId },
      balance: await this.getBalance(wallet.id),
    };
  }

  /** Movimientos del ledger de un usuario (su historial auditable). */
  async listLedgerByUser(
    userId: string,
    take = 50,
  ): Promise<{ balance: Balance; entries: LedgerEntryView[] }> {
    const wallet = await this.getWalletByUser(userId);
    return this.listLedgerByWallet(wallet.id, take);
  }

  /** Para auditoría de ADMIN sobre cualquier usuario. */
  async adminListLedgerByUser(targetUserId: string, take = 100) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: targetUserId },
    });
    if (!wallet) {
      throw new NotFoundException('El usuario no tiene wallet');
    }
    return this.listLedgerByWallet(wallet.id, take);
  }

  private async listLedgerByWallet(walletId: string, take: number) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return {
      balance: await this.getBalance(walletId),
      entries: entries.map(toLedgerView),
    };
  }
}

export interface LedgerEntryView {
  id: string;
  type: string;
  amount: number;
  availableDelta: number;
  frozenDelta: number;
  orderId: string | null;
  memo: string | null;
  createdAt: Date;
}

function toLedgerView(
  e: Prisma.LedgerEntryGetPayload<Record<string, never>>,
): LedgerEntryView {
  return {
    id: e.id,
    type: e.type,
    amount: fromCents(e.amountCents),
    availableDelta: fromCents(e.availableDelta),
    frozenDelta: fromCents(e.frozenDelta),
    orderId: e.orderId,
    memo: e.memo,
    createdAt: e.createdAt,
  };
}
