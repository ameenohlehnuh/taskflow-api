import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { BookingStatusHistory } from './entities/booking-status-history.entity';
import { RefundRequest } from './entities/refund-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, BookingStatusHistory, RefundRequest])],
  exports: [TypeOrmModule],
})
export class BookingsModule {}
