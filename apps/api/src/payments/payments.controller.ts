import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CashInDto, CashOutDto } from './dto/payments.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PaymentMethod } from '../common/domain';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Inicia un fondeo (devuelve instrucciones de Pago Móvil + referencia). */
  @Post('cash-in')
  cashIn(@CurrentUser() user: AuthUser, @Body() dto: CashInDto) {
    return this.payments.requestCashIn(
      user.id,
      dto.amount,
      dto.method ?? PaymentMethod.PAGO_MOVIL,
    );
  }

  /** Confirma el fondeo (simula el webhook del banco/agregador). */
  @Post('cash-in/:reference/confirm')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('reference') reference: string,
  ) {
    return this.payments.confirmCashIn(user.id, reference);
  }

  /** Retiro a Pago Móvil. */
  @Post('cash-out')
  cashOut(@CurrentUser() user: AuthUser, @Body() dto: CashOutDto) {
    return this.payments.requestCashOut(user.id, dto.amount, {
      bank: dto.bank,
      phone: dto.phone,
      cedula: dto.cedula,
    });
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.payments.listMine(user.id);
  }
}
