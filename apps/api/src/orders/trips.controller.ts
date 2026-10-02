import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Roles as RoleValues } from '../common/domain';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleValues.CLIENTE)
@Controller('trips')
export class TripsController {
  constructor(private readonly orders: OrdersService) {}

  /** Previsualiza distancia y tarifa de un viaje. */
  @Post('estimate')
  estimate(@Body() dto: CreateTripDto) {
    return this.orders.estimateTrip(dto);
  }

  /** Crea un viaje (mototaxi) en borrador. Luego se publica como cualquier orden. */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTripDto) {
    return this.orders.createTripDraft(user.id, dto);
  }
}
