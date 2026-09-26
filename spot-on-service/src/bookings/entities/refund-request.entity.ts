import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Booking } from './booking.entity';

export enum RefundRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PROCESSED = 'PROCESSED',
}

@Index('IDX_refund_requests_booking_id', ['bookingId'])
@Entity({ name: 'refund_requests' })
export class RefundRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'booking_id' })
  bookingId: string;

  @ManyToOne(() => Booking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking: Booking;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'requested_amount' })
  requestedAmount: number;

  @Column({ type: 'varchar', length: 3, default: 'THB' })
  currency: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'enum', enum: RefundRequestStatus, enumName: 'refund_requests_status_enum', default: RefundRequestStatus.PENDING })
  status: RefundRequestStatus;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}