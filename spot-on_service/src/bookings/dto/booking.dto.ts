import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { RentalType } from '../../bookings/entities/booking.entity';

export class AvailabilityQueryDto {
  @IsISO8601()
  startTime: string;

  @IsISO8601()
  endTime: string;

  @IsEnum(RentalType)
  rentalType: RentalType;

  @IsOptional()
  @IsString()
  vehicleType?: string;
}

export class VehicleDetailsDto {
  @IsString()
  @IsIn(['sedan', 'suv', 'motorcycle', 'pickup', 'van'])
  type: string;

  @IsString()
  plateNumber: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class CreateBookingDto {
  @IsUUID()
  spotId: string;

  @IsISO8601()
  startTime: string;

  @IsISO8601()
  endTime: string;

  @IsEnum(RentalType)
  rentalType: RentalType;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  quoteId?: string;
}

export class CreateBookingWithVehicleDto extends CreateBookingDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => VehicleDetailsDto)
  vehicleDetails?: VehicleDetailsDto;
}

export class PaymentSubmissionDto {
  @IsEnum(['PROMPTPAY'])
  method: 'PROMPTPAY';

  @IsString()
  amount: string;

  @IsString()
  @IsIn(['THB'])
  currency: string;

  @IsString()
  slipObjectKey: string;

  @IsOptional()
  @IsString()
  clientReference?: string;
}

export class UploadUrlDto {
  @IsString()
  fileName: string;

  @IsIn(['image/jpeg', 'image/png', 'application/pdf'])
  contentType: string;

  @IsNumber()
  @Max(10 * 1024 * 1024)
  sizeBytes: number;
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RefundRequestDto {
  @IsString()
  @MaxLength(1000)
  reason: string;

  @IsString()
  requestedAmount: string;
}

export class HostRejectDto {
  @IsString()
  @IsIn(['AMOUNT_MISMATCH', 'SLIP_UNREADABLE', 'SPOT_UNAVAILABLE', 'OTHER'])
  reasonCode: string;

  @IsString()
  @MaxLength(1000)
  reason: string;

  @IsOptional()
  @IsBoolean()
  allowResubmission?: boolean;
}