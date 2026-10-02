import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { OrdersService } from '../orders/orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { Roles as RoleValues } from '../common/domain';
import {
  ActiveDto,
  KycDto,
  ResolveDisputeDto,
  UpdateConfigDto,
} from './dto/admin.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleValues.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly orders: OrdersService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('users')
  users(@Query('role') role?: string) {
    return this.admin.listUsers(role);
  }

  @Post('users/:id/kyc')
  kyc(@Param('id') id: string, @Body() dto: KycDto) {
    return this.admin.setKyc(id, dto.status);
  }

  @Post('users/:id/active')
  active(@Param('id') id: string, @Body() dto: ActiveDto) {
    return this.admin.setActive(id, dto.isActive);
  }

  @Get('orders')
  orders_() {
    return this.orders.listAll();
  }

  @Get('disputes')
  disputes() {
    return this.admin.listDisputes();
  }

  @Post('orders/:id/resolve')
  resolve(@Param('id') id: string, @Body() dto: ResolveDisputeDto) {
    return this.orders.adminResolveDispute(id, dto.resolution);
  }

  @Get('config')
  getConfig() {
    return this.admin.getConfigView();
  }

  @Put('config')
  updateConfig(@Body() dto: UpdateConfigDto) {
    return this.admin.updateConfig(dto);
  }
}
