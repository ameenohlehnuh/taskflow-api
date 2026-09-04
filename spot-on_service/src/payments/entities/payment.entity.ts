import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Booking } from '../../bookings/entities/booking.entity';
import { User } from '../../users/entities/user.entity';

export enum PaymentMethod {
  PROMPTPAY = 'promptpay',
}

export enum PaymentVerificationStatus {
  AWAITING_SLIP = 'awaiting_slip',
  PENDING_REVIEW = 'pending_review',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

@Entity({ name: 'payments' })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true, name: 'booking_id' })
  bookingId: string;

  @OneToOne(() => Booking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking: Booking;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    default: PaymentMethod.PROMPTPAY,
  })
  method: PaymentMethod;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  amount: number;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'slip_image_url',
  })
  slipImageUrl: string | null;

  @Column({
    type: 'enum',
    enum: PaymentVerificationStatus,
    default: PaymentVerificationStatus.AWAITING_SLIP,
    name: 'verification_status',
  })
  verificationStatus: PaymentVerificationStatus;

  @Column({
    type: 'timestamptz',
    nullable: true,
    name: 'verified_at',
  })
  verifiedAt: Date | null;

  @Column({
    type: 'uuid',
    nullable: true,
    name: 'verified_by',
  })
  verifiedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'verified_by' })
  verifier: User | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
