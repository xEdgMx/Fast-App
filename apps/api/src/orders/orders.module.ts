import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TripsController } from './trips.controller';
import { WalletModule } from '../wallet/wallet.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [WalletModule, RealtimeModule],
  controllers: [OrdersController, TripsController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
