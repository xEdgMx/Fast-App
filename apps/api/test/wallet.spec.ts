import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { WalletService } from '../src/wallet/wallet.service';
import { LedgerType } from '../src/common/domain';

const DB_FILE = join(__dirname, '..', 'prisma', 'test.db');

describe('WalletService — ledger de doble entrada', () => {
  let prisma: PrismaClient;
  let wallet: WalletService;
  let userId: string;

  beforeAll(() => {
    prisma = new PrismaClient({
      datasources: { db: { url: `file:${DB_FILE}` } },
    });
    // WalletService solo usa métodos de Prisma; inyectamos el client de prueba.
    wallet = new WalletService(prisma as never);
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
    const user = await prisma.user.create({
      data: {
        email: `u_${Date.now()}@test.local`,
        name: 'Test',
        role: 'CLIENTE',
        passwordHash: 'x',
        wallet: { create: {} },
      },
      include: { wallet: true },
    });
    userId = user.id;
  });

  it('cash-in incrementa el saldo disponible', async () => {
    await wallet.cashIn(userId, 100.5);
    const bal = await wallet.getBalanceByUser(userId);
    expect(bal.available).toBe(100.5);
    expect(bal.frozen).toBe(0);
    expect(bal.availableCents).toBe(10050); // se guarda en céntimos
  });

  it('suma correctamente varios cash-in', async () => {
    await wallet.cashIn(userId, 100);
    await wallet.cashIn(userId, 50.25);
    const bal = await wallet.getBalanceByUser(userId);
    expect(bal.available).toBe(150.25);
  });

  it('un HOLD válido mueve fondos de disponible a congelado (escrow)', async () => {
    await wallet.cashIn(userId, 200);
    const w = await wallet.getWalletByUser(userId);
    await wallet.postTransaction([
      {
        walletId: w.id,
        type: LedgerType.HOLD,
        amountCents: 12000,
        availableDelta: -12000,
        frozenDelta: +12000,
        memo: 'escrow de prueba',
      },
    ]);
    const bal = await wallet.getBalanceByUser(userId);
    expect(bal.available).toBe(80);
    expect(bal.frozen).toBe(120);
    expect(bal.total).toBe(200); // el total no cambia al congelar
  });

  it('ATOMICIDAD: un HOLD mayor al saldo se revierte entero (invariante)', async () => {
    await wallet.cashIn(userId, 50);
    const w = await wallet.getWalletByUser(userId);

    await expect(
      wallet.postTransaction([
        {
          walletId: w.id,
          type: LedgerType.HOLD,
          amountCents: 9999,
          availableDelta: -9999, // dejaría el disponible en negativo
          frozenDelta: +9999,
          memo: 'debe fallar',
        },
      ]),
    ).rejects.toThrow('Fondos insuficientes');

    // El saldo no cambió y NO quedó ningún registro del intento fallido.
    const bal = await wallet.getBalanceByUser(userId);
    expect(bal.available).toBe(50);
    expect(bal.frozen).toBe(0);
    const count = await prisma.ledgerEntry.count({
      where: { type: LedgerType.HOLD },
    });
    expect(count).toBe(0);
  });
});
