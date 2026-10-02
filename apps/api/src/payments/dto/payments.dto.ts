import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MinLength,
} from 'class-validator';
import { PaymentMethod } from '../../common/domain';

export class CashInDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  amount!: number;

  @IsOptional()
  @IsIn([PaymentMethod.PAGO_MOVIL, PaymentMethod.EFECTIVO])
  method?: string = PaymentMethod.PAGO_MOVIL;
}

export class CashOutDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(4)
  bank!: string; // código de banco (p. ej. 0102)

  @IsString()
  @MinLength(7)
  phone!: string;

  @IsString()
  @MinLength(5)
  cedula!: string;
}
