import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from '../reviews/entities/review.entity';
import { User } from '../users/entities/user.entity';
import { ParkingSpot } from './entities/parking-spot.entity';
import { SpotsController } from './spots.controller';
import { SpotsService } from './spots.service';

@Module({
  imports: [TypeOrmModule.forFeature([ParkingSpot, Review, User])],
  controllers: [SpotsController],
  providers: [SpotsService],
  exports: [TypeOrmModule],
})
export class SpotsModule {}
