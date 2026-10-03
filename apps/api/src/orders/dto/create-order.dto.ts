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

  /** Precio unitario estimado (opcional: en modo presupuesto no se usa). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  estUnitPrice?: number;
}

export class CreateOrderDto {
  @IsString()
  @MinLength(3, { message: 'La dirección de entrega es obligatoria' })
  deliveryAddress!: string;

  /** Nombre y/o dirección del comercio donde comprar (ej. "La Pradera, Tulum"). */
  @IsOptional()
  @IsString()
  storeName?: string;

  /** Categoría: supermercado, comida, farmacia, etc. (informativa) */
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Tarifa de delivery en unidades de moneda. Si se omite, se usa la de por defecto. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deliveryFee?: number;

  /**
   * Presupuesto del cliente (cuánto piensa gastar). En modo presupuesto los
   * productos van sin precio unitario y este monto es la estimación que se congela.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  budget?: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'La lista debe tener al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemInput)
  items!: OrderItemInput[];
}
