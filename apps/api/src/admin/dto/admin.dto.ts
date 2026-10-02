import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { KycStatus } from '../../common/domain';

export class KycDto {
  @IsIn([KycStatus.APPROVED, KycStatus.REJECTED, KycStatus.PENDING])
  status!: string;
}

export class ActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

export class ResolveDisputeDto {
  @IsIn(['RELEASE', 'REFUND'])
  resolution!: 'RELEASE' | 'REFUND';
}

/** Config en unidades legibles (tarifas en moneda, comisión como fracción). */
export class UpdateConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1, { message: 'La comisión es una fracción entre 0 y 1' })
  commissionRate?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deliveryFee?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tripBaseFare?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tripPerKm?: number;
}
