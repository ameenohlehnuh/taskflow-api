import { IsEnum } from 'class-validator';
import { SpotStatus } from '../../spots/entities/parking-spot.entity';

export class UpdateSpotStatusDto {
  @IsEnum(SpotStatus)
  status: SpotStatus;
}
