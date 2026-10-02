import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CashInDto } from './dto/cash-in.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Roles as RoleValues } from '../common/domain';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  /** Saldo del usuario autenticado (disponible + congelado). */
  @Get('me')
  async myBalance(@CurrentUser() user: AuthUser) {
    return this.wallet.getBalanceByUser(user.id);
  }

  /** Historial de movimientos del usuario autenticado. */
  @Get('me/ledger')
  async myLedger(
    @CurrentUser() user: AuthUser,
    @Query('take') take?: string,
  ) {
    return this.wallet.listLedgerByUser(user.id, take ? Number(take) : 50);
  }

  /** Fondear la wallet (simula la pasarela de pago). */
  @Post('me/cash-in')
  async cashIn(@CurrentUser() user: AuthUser, @Body() dto: CashInDto) {
    return this.wallet.cashIn(user.id, dto.amount, dto.memo);
  }

  /** Auditoría: un ADMIN consulta el ledger de cualquier usuario. */
  @Roles(RoleValues.ADMIN)
  @Get(':userId/ledger')
  async auditLedger(@Param('userId') userId: string) {
    return this.wallet.adminListLedgerByUser(userId);
  }
}
