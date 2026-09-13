import {
  ArrayMaxSize,
  IsArray,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateSpotDto {
  @IsString()
  @Length(3, 255)
  title: string;

  @IsString()
  @Length(10, 2000)
  description: string;

  @IsString()
  @Length(5, 500)
  address: string;

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerHour?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerDay?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerMonth?: number;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  amenities: string[];

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  vehicleTypes: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  images?: string[];
}
