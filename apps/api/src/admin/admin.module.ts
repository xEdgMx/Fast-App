import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { WalletModule } from '../wallet/wallet.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [WalletModule, OrdersModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
