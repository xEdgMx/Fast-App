import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class OrderItemInput {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  /** Precio unitario estimado, en unidades de moneda. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  estUnitPrice!: number;
}

export class CreateOrderDto {
  @IsString()
  @MinLength(3, { message: 'La dirección es obligatoria' })
  deliveryAddress!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Tarifa de delivery en unidades de moneda. Si se omite, se usa la de por defecto. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deliveryFee?: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'La lista debe tener al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemInput)
  items!: OrderItemInput[];
}
