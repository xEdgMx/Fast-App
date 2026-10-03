import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateTripDto {
  @IsString()
  @MinLength(3, { message: 'Indica el punto de origen' })
  originAddress!: string;

  @IsLatitude()
  originLat!: number;

  @IsLongitude()
  originLng!: number;

  @IsString()
  @MinLength(3, { message: 'Indica el destino' })
  destAddress!: string;

  @IsLatitude()
  destLat!: number;

  @IsLongitude()
  destLng!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Distancia real por calles (km), calculada por el mapa (OSRM). Si falta, se usa la línea recta. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  distanceKm?: number;
}
