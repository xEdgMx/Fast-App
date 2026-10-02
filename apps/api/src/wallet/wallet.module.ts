import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService], // lo usará el módulo de órdenes en la Fase 2
})
export class WalletModule {}
