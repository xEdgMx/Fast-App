import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PagoMovilSandboxProvider } from './pago-movil-sandbox.provider';
import { PAYMENT_PROVIDER } from './payment-provider';
import { WalletModule } from '../wallet/wallet.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [WalletModule, RealtimeModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    // Cambiar aquí el proveedor por el real (PagoFlash, Mega Soft, banco C2P).
    { provide: PAYMENT_PROVIDER, useClass: PagoMovilSandboxProvider },
  ],
})
export class PaymentsModule {}
