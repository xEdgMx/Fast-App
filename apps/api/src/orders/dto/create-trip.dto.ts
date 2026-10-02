import { IsLatitude, IsLongitude, IsOptional, IsString, MinLength } from 'class-validator';

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
}
