import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { OrderItemStatus } from '../../common/domain';

export class UpdateItemDto {
  @IsIn([
    OrderItemStatus.COMPRADO,
    OrderItemStatus.AGOTADO,
    OrderItemStatus.REEMPLAZADO,
  ])
  status!: string;

  /** Precio unitario real pagado en caja (requerido salvo si está AGOTADO). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  realUnitPrice?: number;

  /** Nombre del producto sustituto (para REEMPLAZADO). */
  @IsOptional()
  @IsString()
  name?: string;
}
