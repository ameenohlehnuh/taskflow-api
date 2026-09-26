import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../reviews/entities/review.entity';
import { User } from '../users/entities/user.entity';
import { ParkingSpot, SpotStatus } from './entities/parking-spot.entity';
import { CreateSpotDto } from './dto/create-spot.dto';
import { FilterSpotsDto, RentalTypeFilter, SpotSort } from './dto/filter-spots.dto';
import { NearbySpotsQueryDto } from './dto/nearby-spots-query.dto';
import { UpdateSpotDto } from './dto/update-spot.dto';

const RENTAL_TYPE_PRICE_COLUMN: Record<RentalTypeFilter, string> = {
  [RentalTypeFilter.HOURLY]: 'price_per_hour',
  [RentalTypeFilter.DAILY]: 'price_per_day',
  [RentalTypeFilter.MONTHLY]: 'price_per_month',
};

@Injectable()
export class SpotsService {
  constructor(
    @InjectRepository(ParkingSpot)
    private readonly spotsRepository: Repository<ParkingSpot>,
    @InjectRepository(Review)
    private readonly reviewsRepository: Repository<Review>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  private toResponseDto(spot: ParkingSpot) {
    return {
      id: spot.id,
      hostId: spot.hostId,
      title: spot.title,
      description: spot.description,
      address: spot.address,
      location: spot.location,
      pricePerHour: spot.pricePerHour,
      pricePerDay: spot.pricePerDay,
      pricePerMonth: spot.pricePerMonth,
      images: spot.images,
      amenities: spot.amenities,
      vehicleTypes: spot.vehicleTypes,
      status: spot.status,
      rating: spot.rating,
      reviewCount: spot.reviewCount,
      createdAt: spot.createdAt,
      hostInfo: spot.host
        ? {
            id: spot.host.id,
            name: spot.host.name,
            avatarUrl: spot.host.avatarUrl,
            rating: spot.host.rating,
            reviewCount: spot.host.reviewCount,
          }
        : undefined,
    };
  }

  async findFiltered(dto: FilterSpotsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.spotsRepository
      .createQueryBuilder('spot')
      .leftJoinAndSelect('spot.host', 'host')
      .where('spot.status = :status', { status: SpotStatus.ACTIVE });

    if (dto.q) {
      qb.andWhere(
        '(spot.title ILIKE :q OR spot.description ILIKE :q OR spot.address ILIKE :q)',
        { q: `%${dto.q}%` },
      );
    }

    if (dto.vehicleType) {
      qb.andWhere(':vehicleType = ANY(spot.vehicle_types)', {
        vehicleType: dto.vehicleType,
      });
    }

    if (dto.rentalType) {
      const column = RENTAL_TYPE_PRICE_COLUMN[dto.rentalType];
      qb.andWhere(`spot.${column} IS NOT NULL`);
    }

    if (dto.minPrice !== undefined) {
      qb.andWhere(
        `(spot.price_per_hour >= :minPrice OR spot.price_per_day >= :minPrice OR spot.price_per_month >= :minPrice)`,
        { minPrice: dto.minPrice },
      );
    }

    if (dto.maxPrice !== undefined) {
      qb.andWhere(
        `(spot.price_per_hour <= :maxPrice OR spot.price_per_day <= :maxPrice OR spot.price_per_month <= :maxPrice)`,
        { maxPrice: dto.maxPrice },
      );
    }

    if (dto.amenities) {
      const amenities = dto.amenities
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      if (amenities.length > 0) {
        qb.andWhere('spot.amenities && :amenities', { amenities });
      }
    }

    const hasCoords = dto.lat !== undefined && dto.lng !== undefined;

    if (hasCoords) {
      qb.addSelect(
        'ST_Distance(spot.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)',
        'distance',
      );
      qb.setParameters({ lng: dto.lng, lat: dto.lat });
    }

    switch (dto.sort) {
      case SpotSort.PRICE_ASC:
        qb.addSelect(
          'COALESCE(spot.price_per_hour, spot.price_per_day, spot.price_per_month)',
          'effective_price',
        ).orderBy('effective_price', 'ASC');
        break;
      case SpotSort.PRICE_DESC:
        qb.addSelect(
          'COALESCE(spot.price_per_hour, spot.price_per_day, spot.price_per_month)',
          'effective_price',
        ).orderBy('effective_price', 'DESC');
        break;
      case SpotSort.RATING:
        qb.orderBy('spot.rating', 'DESC');
        break;
      case SpotSort.NEARBY:
      default:
        if (hasCoords) {
          qb.orderBy('distance', 'ASC');
        } else {
          qb.orderBy('spot.created_at', 'DESC');
        }
        break;
    }

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((s) => this.toResponseDto(s)),
      total,
      page,
      limit,
    };
  }

  async findNearby(query: NearbySpotsQueryDto) {
    const radiusMeters = (query.radiusKm ?? 5) * 1000;

    const items = await this.spotsRepository
      .createQueryBuilder('spot')
      .leftJoinAndSelect('spot.host', 'host')
      .where('spot.status = :status', { status: SpotStatus.ACTIVE })
      .andWhere(
        `ST_DWithin(spot.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radiusMeters)`,
      )
      .setParameters({
        lng: query.lng,
        lat: query.lat,
        radiusMeters,
      })
      .orderBy(
        `ST_Distance(spot.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)`,
        'ASC',
      )
      .limit(query.limit ?? 20)
      .getMany();

    return items.map((s) => this.toResponseDto(s));
  }

  async findOne(id: string) {
    const spot = await this.spotsRepository.findOne({
      where: { id },
      relations: { host: true },
    });
    if (!spot) {
      throw new NotFoundException('Spot not found');
    }
    return this.toResponseDto(spot);
  }

  async findReviews(spotId: string) {
    return this.reviewsRepository.find({
      where: { spotId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByHost(hostId: string) {
    const items = await this.spotsRepository.find({
      where: { hostId },
      order: { createdAt: 'DESC' },
    });
    return items.map((s) => this.toResponseDto(s));
  }

  async create(hostId: string, dto: CreateSpotDto) {
    const saved = await this.spotsRepository
      .createQueryBuilder()
      .insert()
      .into(ParkingSpot)
      .values({
        hostId,
        title: dto.title,
        description: dto.description,
        address: dto.address,
        pricePerHour: dto.pricePerHour ?? null,
        pricePerDay: dto.pricePerDay ?? null,
        pricePerMonth: dto.pricePerMonth ?? null,
        amenities: dto.amenities,
        vehicleTypes: dto.vehicleTypes,
        images: dto.images ?? [],
        status: SpotStatus.ACTIVE,
        location: () =>
          `ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography`,
      })
      .returning('*')
      .execute();

    return this.findOne(saved.generatedMaps[0].id as string);
  }

  async update(id: string, userId: string, dto: UpdateSpotDto) {
    const spot = await this.spotsRepository.findOneBy({ id });
    if (!spot) {
      throw new NotFoundException('Spot not found');
    }
    if (spot.hostId !== userId) {
      throw new ForbiddenException('You do not own this spot');
    }

    const { lat, lng, ...rest } = dto;
    Object.assign(spot, rest);
    await this.spotsRepository.save(spot);

    if (lat !== undefined && lng !== undefined) {
      await this.spotsRepository.query(
        `UPDATE "parking_spots" SET "location" = ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography WHERE "id" = :id`,
        { lng, lat, id },
      );
    }

    return this.findOne(id);
  }

  async updateStatus(id: string, userId: string, status: SpotStatus) {
    const spot = await this.spotsRepository.findOneBy({ id });
    if (!spot) {
      throw new NotFoundException('Spot not found');
    }
    if (spot.hostId !== userId) {
      throw new ForbiddenException('You do not own this spot');
    }

    spot.status = status;
    await this.spotsRepository.save(spot);
    return this.findOne(id);
  }
}
