import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { MessageDto } from './dto/message.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Roles as RoleValues } from '../common/domain';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // ── Cliente ──
  @Roles(RoleValues.CLIENTE)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.createDraft(user.id, dto);
  }

  @Roles(RoleValues.CLIENTE)
  @Post(':id/publish')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.publish(user.id, id);
  }

  @Roles(RoleValues.CLIENTE)
  @Post(':id/approve-extra')
  approveExtra(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.approveExtra(user.id, id);
  }

  @Roles(RoleValues.CLIENTE)
  @Post(':id/confirm-delivery')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.confirmDelivery(user.id, id);
  }

  @Roles(RoleValues.CLIENTE)
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.orders.listMine(user.id);
  }

  // ── Conductor ──
  @Roles(RoleValues.CONDUCTOR)
  @Get('feed')
  feed() {
    return this.orders.feed();
  }

  @Roles(RoleValues.CONDUCTOR)
  @Get('assigned')
  assigned(@CurrentUser() user: AuthUser) {
    return this.orders.listAssigned(user.id);
  }

  @Roles(RoleValues.CONDUCTOR)
  @Post(':id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.accept(user.id, id);
  }

  @Roles(RoleValues.CONDUCTOR)
  @Post(':id/start-shopping')
  startShopping(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.startShopping(user.id, id);
  }

  @Roles(RoleValues.CONDUCTOR)
  @Post(':id/start-trip')
  startTrip(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.startTrip(user.id, id);
  }

  @Roles(RoleValues.CONDUCTOR)
  @Post(':id/items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.orders.updateItem(user.id, id, itemId, dto);
  }

  @Roles(RoleValues.CONDUCTOR)
  @Post(':id/finish-shopping')
  finishShopping(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.finishShopping(user.id, id);
  }

  @Roles(RoleValues.CONDUCTOR)
  @Post(':id/deliver')
  deliver(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.deliver(user.id, id);
  }

  // ── Común (cliente, conductor o admin) ──
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.cancel(user, id);
  }

  @Post(':id/dispute')
  dispute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.openDispute(user, id);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MessageDto,
  ) {
    return this.orders.addMessage(user, id, dto.text);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.listMessages(user, id);
  }

  @Get(':id/tracking')
  tracking(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.listTracking(user, id);
  }

  // ── Admin ──
  @Roles(RoleValues.ADMIN)
  @Get()
  all() {
    return this.orders.listAll();
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.getOne(user, id);
  }
}
