import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { Booking } from '../../bookings/entities/booking.entity';
import { User } from '../../users/entities/user.entity';
import { ParkingSpot } from '../../spots/entities/parking-spot.entity';

@Check('"rating" >= 1 AND "rating" <= 5')
@Entity({ name: 'reviews' })
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'booking_id' })
  bookingId: string;

  @ManyToOne(() => Booking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking: Booking;

  @Column({ type: 'uuid', name: 'from_user_id' })
  fromUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'from_user_id' })
  fromUser: User;

  @Column({ type: 'uuid', name: 'to_user_id' })
  toUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'to_user_id' })
  toUser: User;

  @Column({ type: 'uuid', nullable: true, name: 'spot_id' })
  spotId: string | null;

  @ManyToOne(() => ParkingSpot, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'spot_id' })
  spot: ParkingSpot | null;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text' })
  comment: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
