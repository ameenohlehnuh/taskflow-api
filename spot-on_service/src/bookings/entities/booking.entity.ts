import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ParkingSpot } from '../../spots/entities/parking-spot.entity';
import { User } from '../../users/entities/user.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { BookingStatusHistory } from './booking-status-history.entity';
import { RefundRequest } from './refund-request.entity';

export enum RentalType {
  HOURLY = 'hourly',
  DAILY = 'daily',
  MONTHLY = 'monthly',
}

export enum BookingStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAYMENT_SUBMITTED = 'PAYMENT_SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  ONGOING = 'ONGOING',
  COMPLETED = 'COMPLETED',
  CANCELLED_BY_USER = 'CANCELLED_BY_USER',
  CANCELLED_BY_HOST = 'CANCELLED_BY_HOST',
  REJECTED_BY_HOST = 'REJECTED_BY_HOST',
  EXPIRED = 'EXPIRED',
  REFUNDED = 'REFUNDED',
}

export interface VehicleDetails {
  type: string;
  plateNumber: string;
  color?: string;
}

@Index('IDX_bookings_spot_time', ['spotId', 'startTime', 'endTime'])
@Index('UQ_bookings_idempotency_key', ['idempotencyKey'], { unique: true })
@Entity({ name: 'bookings' })
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'spot_id' })
  spotId: string;

  @ManyToOne(() => ParkingSpot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'spot_id' })
  spot: ParkingSpot;

  @Column({ type: 'uuid', name: 'renter_id' })
  renterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'renter_id' })
  renter: User;

  @Column({ type: 'uuid', name: 'host_id' })
  hostId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'host_id' })
  host: User;

  @Column({
    type: 'enum',
    enum: RentalType,
    name: 'rental_type',
  })
  rentalType: RentalType;

  @Column({ type: 'timestamptz', name: 'start_time' })
  startTime: Date;

  @Column({ type: 'timestamptz', name: 'end_time' })
  endTime: Date;

  @Column({ type: 'varchar', length: 3, default: 'THB' })
  currency: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'unit_rate', nullable: true })
  unitRate: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  subtotal: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0, name: 'service_fee' })
  serviceFee: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    name: 'total_price',
  })
  totalPrice: number;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.PENDING_PAYMENT,
  })
  status: BookingStatus;

  @Column({ type: 'uuid', nullable: true, name: 'payment_id' })
  paymentId: string | null;

  @OneToOne(() => Payment, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment | null;

  @OneToMany(() => BookingStatusHistory, (history) => history.booking)
  statusHistory: BookingStatusHistory[];

  @OneToMany(() => RefundRequest, (refund) => refund.booking)
  refundRequests: RefundRequest[];

  @Column({ type: 'jsonb', nullable: true, name: 'vehicle_details' })
  vehicleDetails: VehicleDetails | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'idempotency_key' })
  idempotencyKey: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
