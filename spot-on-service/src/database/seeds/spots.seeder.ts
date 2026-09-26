import { DataSource } from 'typeorm';
import { ParkingSpot, SpotStatus } from '../../spots/entities/parking-spot.entity';
import { SeedUserIds, seedIds, SeedSpotIds } from './seed-ids';

export async function seedSpots(dataSource: DataSource, users: SeedUserIds): Promise<SeedSpotIds> {
  const repository = dataSource.getRepository(ParkingSpot);

  await repository.upsert(
    [
      {
        id: seedIds.spots.siam,
        hostId: users.somchai,
        title: 'Indoor Parking near Siam Paragon',
        description: 'Covered private parking spot, 24/7 CCTV, easy walking distance to BTS Siam and Siam Paragon.',
        address: 'Rama I Rd, Pathum Wan, Bangkok 10330',
        location: { type: 'Point', coordinates: [100.5349, 13.7466] } as any,
        pricePerHour: 50,
        pricePerDay: 350,
        pricePerMonth: 4500,
        images: ['https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800'],
        amenities: ['CCTV', 'Covered', 'EV Charger', 'Security Guard'],
        vehicleTypes: ['sedan', 'suv'],
        status: SpotStatus.ACTIVE,
        rating: 4.9,
        reviewCount: 15,
      },
      {
        id: seedIds.spots.asoke,
        hostId: users.jane,
        title: 'Condo Parking Spot at Asoke BTS',
        description: 'Safe keycard-access parking lot in luxury condo building near Terminal 21 and BTS Asoke.',
        address: 'Sukhumvit 21, Khlong Toei Nuea, Watthana, Bangkok 10110',
        location: { type: 'Point', coordinates: [100.5608, 13.7367] } as any,
        pricePerHour: 40,
        pricePerDay: 280,
        pricePerMonth: 3800,
        images: ['https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=800'],
        amenities: ['CCTV', 'Keycard Access', 'Covered'],
        vehicleTypes: ['sedan', 'suv', 'motorcycle'],
        status: SpotStatus.ACTIVE,
        rating: 5.0,
        reviewCount: 8,
      },
    ],
    ['id'],
  );

  return seedIds.spots;
}