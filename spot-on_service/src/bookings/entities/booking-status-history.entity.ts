import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Booking, BookingStatus } from './booking.entity';

export enum ActorType {
  RENTER = 'RENTER',
  HOST = 'HOST',
  SYSTEM = 'SYSTEM',
}

@Entity({ name: 'booking_status_history' })
export class BookingStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'booking_id' })
  bookingId: string;

  @ManyToOne(() => Booking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking: Booking;

  @Column({ type: 'enum', enum: BookingStatus, enumName: 'bookings_status_enum' })
  status: BookingStatus;

  @Column({ type: 'enum', enum: BookingStatus, enumName: 'bookings_status_enum', nullable: true, name: 'previous_status' })
  previousStatus: BookingStatus | null;

  @Column({ type: 'uuid', nullable: true, name: 'actor_id' })
  actorId: string | null;

  @Column({ type: 'enum', enum: ActorType })
  actorType: ActorType;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}