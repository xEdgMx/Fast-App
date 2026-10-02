import { IsNumber, IsOptional, IsPositive, IsString, Max } from 'class-validator';

export class CashInDto {
  /** Monto en unidades de moneda (no céntimos). Ej: 150.50 */
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Monto inválido' })
  @IsPositive({ message: 'El monto debe ser mayor a 0' })
  @Max(1_000_000, { message: 'Monto demasiado alto' })
  amount!: number;

  @IsOptional()
  @IsString()
  memo?: string;
}
