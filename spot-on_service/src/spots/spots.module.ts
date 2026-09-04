import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParkingSpot } from './entities/parking-spot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ParkingSpot])],
  exports: [TypeOrmModule],
})
export class SpotsModule {}
