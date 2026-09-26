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
import { User } from '../../users/entities/user.entity';

export enum SpotStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity({ name: 'parking_spots' })
export class ParkingSpot {
  @PrimaryGeneratedColumn('uuid')
  id?: string;

  @Column({ type: 'uuid', name: 'host_id' })
  hostId?: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'host_id' })
  host?: User;

  @Column({ type: 'varchar', length: 255 })
  title?: string;

  @Column({ type: 'text' })
  description?: string;

  @Column({ type: 'varchar', length: 500 })
  address?: string;

  @Index({ spatial: true })
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  location?: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    name: 'price_per_hour',
  })
  pricePerHour?: number | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    name: 'price_per_day',
  })
  pricePerDay?: number | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    name: 'price_per_month',
  })
  pricePerMonth?: number | null;

  @Column({ type: 'jsonb', default: [] })
  images?: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  amenities?: string[];

  @Column({ type: 'text', array: true, name: 'vehicle_types', default: '{}' })
  vehicleTypes?: string[];

  @Column({
    type: 'enum',
    enum: SpotStatus,
    default: SpotStatus.ACTIVE,
  })
  status?: SpotStatus;

  @Column({
    type: 'numeric',
    precision: 2,
    scale: 1,
    default: 0.0,
  })
  rating?: number;

  @Column({
    type: 'int',
    default: 0,
    name: 'review_count',
  })
  reviewCount?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt?: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt?: Date;
}
