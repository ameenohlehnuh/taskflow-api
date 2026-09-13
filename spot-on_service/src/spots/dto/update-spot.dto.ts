import { PartialType } from '@nestjs/mapped-types';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
} from 'class-validator';
import { CreateSpotDto } from './create-spot.dto';

export class UpdateSpotDto extends PartialType(CreateSpotDto) {
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;
}
