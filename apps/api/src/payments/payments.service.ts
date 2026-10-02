import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
  PayoutTarget,
} from './payment-provider';
import {
  PaymentKind,
  PaymentMethod,
  PaymentStatus,
  fromCents,
  toCents,
} from '../common/domain';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly realtime: RealtimeGateway,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** Inicia un fondeo: crea el intento y devuelve las instrucciones de Pago Móvil. */
  async requestCashIn(userId: string, amount: number, method: string) {
    const amountCents = toCents(amount);
    if (amountCents <= 0) throw new BadRequestException('Monto inválido');

    const instr = await this.provider.initCashIn(amountCents);
    const intent = await this.prisma.paymentIntent.create({
      data: {
        userId,
        kind: PaymentKind.CASH_IN,
        method,
        amountCents,
        reference: instr.reference,
        status: PaymentStatus.PENDIENTE,
      },
    });
    return { intent, instructions: instr };
  }

  /**
   * Confirma un fondeo (simula el webhook del agregador/banco). Acredita la wallet.
   * Idempotente: si ya estaba confirmado, no acredita dos veces.
   */
  async confirmCashIn(userId: string, reference: string) {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { reference },
    });
    if (!intent || intent.userId !== userId) {
      throw new NotFoundException('Pago no encontrado');
    }
    if (intent.status === PaymentStatus.CONFIRMADO) {
      return { alreadyConfirmed: true, intent };
    }
    const received = await this.provider.verifyCashIn(reference);
    if (!received) {
      throw new BadRequestException('Aún no se recibe el pago');
    }

    await this.wallet.creditCashIn(
      userId,
      intent.amountCents,
      `Fondeo ${reference} (${intent.method})`,
    );
    const updated = await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: PaymentStatus.CONFIRMADO, confirmedAt: new Date() },
    });
    this.realtime.notifyUser(
      userId,
      `Fondeo confirmado: +Bs. ${fromCents(intent.amountCents).toFixed(2)}`,
      'success',
    );
    return { intent: updated };
  }

  /** Retiro a Pago Móvil: debita la wallet y "envía" el payout. */
  async requestCashOut(userId: string, amount: number, target: PayoutTarget) {
    const amountCents = toCents(amount);
    if (amountCents <= 0) throw new BadRequestException('Monto inválido');

    const balance = await this.wallet.getBalanceByUser(userId);
    if (balance.availableCents < amountCents) {
      throw new BadRequestException('Saldo disponible insuficiente');
    }

    // Debita primero (el invariante del ledger evita sobregiro), luego envía.
    await this.wallet.debitCashOut(
      userId,
      amountCents,
      `Retiro a Pago Móvil ${target.phone}`,
    );
    const sent = await this.provider.sendPayout(amountCents, target);

    const intent = await this.prisma.paymentIntent.create({
      data: {
        userId,
        kind: PaymentKind.CASH_OUT,
        method: PaymentMethod.PAGO_MOVIL,
        amountCents,
        reference: sent.reference,
        status: sent.ok ? PaymentStatus.CONFIRMADO : PaymentStatus.PENDIENTE,
        confirmedAt: sent.ok ? new Date() : null,
        bank: target.bank,
        phone: target.phone,
        cedula: target.cedula,
      },
    });
    this.realtime.notifyUser(
      userId,
      `Retiro enviado: -Bs. ${fromCents(amountCents).toFixed(2)}`,
      'info',
    );
    return { intent, balance: await this.wallet.getBalanceByUser(userId) };
  }

  async listMine(userId: string) {
    return this.prisma.paymentIntent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
