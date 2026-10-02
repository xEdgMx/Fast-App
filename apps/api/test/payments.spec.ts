import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { WalletService } from '../src/wallet/wallet.service';
import { PaymentsService } from '../src/payments/payments.service';
import { PagoMovilSandboxProvider } from '../src/payments/pago-movil-sandbox.provider';
import { PaymentStatus } from '../src/common/domain';

const DB_FILE = join(__dirname, '..', 'prisma', 'test.db');

describe('PaymentsService — Pago Móvil (Fase 6)', () => {
  let prisma: PrismaClient;
  let wallet: WalletService;
  let payments: PaymentsService;
  let userId: string;

  beforeAll(() => {
    prisma = new PrismaClient({
      datasources: { db: { url: `file:${DB_FILE}` } },
    });
    wallet = new WalletService(prisma as never);
    const realtimeStub = { notifyUser: () => undefined };
    payments = new PaymentsService(
      prisma as never,
      wallet,
      realtimeStub as never,
      new PagoMovilSandboxProvider(),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.paymentIntent.deleteMany();
    await prisma.ledgerEntry.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.user.deleteMany();
    const u = await prisma.user.create({
      data: {
        email: 'p@test.local',
        name: 'P',
        role: 'CLIENTE',
        passwordHash: 'x',
        wallet: { create: {} },
      },
    });
    userId = u.id;
  });

  it('cash-in: crea intento PENDIENTE y al confirmar acredita la wallet', async () => {
    const { intent, instructions } = await payments.requestCashIn(
      userId,
      25.5,
      'PAGO_MOVIL',
    );
    expect(intent.status).toBe(PaymentStatus.PENDIENTE);
    expect(instructions.reference).toBe(intent.reference);

    let bal = await wallet.getBalanceByUser(userId);
    expect(bal.available).toBe(0); // aún no acreditado

    await payments.confirmCashIn(userId, intent.reference);
    bal = await wallet.getBalanceByUser(userId);
    expect(bal.available).toBe(25.5);
  });

  it('cash-in: confirmar dos veces no acredita doble (idempotente)', async () => {
    const { intent } = await payments.requestCashIn(userId, 10, 'PAGO_MOVIL');
    await payments.confirmCashIn(userId, intent.reference);
    const res = await payments.confirmCashIn(userId, intent.reference);
    expect(res.alreadyConfirmed).toBe(true);
    const bal = await wallet.getBalanceByUser(userId);
    expect(bal.available).toBe(10);
  });

  it('cash-out: debita la wallet y registra el retiro', async () => {
    await wallet.creditCashIn(userId, 5000); // Bs. 50
    const { balance } = await payments.requestCashOut(userId, 30, {
      bank: '0102',
      phone: '0414-5551234',
      cedula: 'V-12345678',
    });
    expect(balance.available).toBe(20);
  });

  it('cash-out: rechaza si no hay saldo suficiente', async () => {
    await wallet.creditCashIn(userId, 1000); // Bs. 10
    await expect(
      payments.requestCashOut(userId, 50, {
        bank: '0102',
        phone: '0414-5551234',
        cedula: 'V-12345678',
      }),
    ).rejects.toThrow('insuficiente');
    const bal = await wallet.getBalanceByUser(userId);
    expect(bal.available).toBe(10); // intacto
  });
});
