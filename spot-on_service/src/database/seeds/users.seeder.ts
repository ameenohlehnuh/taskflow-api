import { DataSource } from 'typeorm';
import { User, UserRole } from '../../users/entities/user.entity';
import { seedIds, SeedUserIds } from './seed-ids';

export async function seedUsers(dataSource: DataSource): Promise<SeedUserIds> {
  const repository = dataSource.getRepository(User);
  const defaultHash = '$2b$10$epHa9O7j1047467wzYc5xeg4K8Yj5xU767Yg4j5k6l7m8n9o0p1q2';

  await repository.upsert(
    [
      {
        id: seedIds.users.somchai,
        name: 'Somchai Jaidee',
        email: 'somchai@example.com',
        passwordHash: defaultHash,
        phone: '0812345678',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400',
        role: UserRole.BOTH,
        rating: 4.8,
        reviewCount: 12,
      },
      {
        id: seedIds.users.jane,
        name: 'Jane Doe',
        email: 'jane@example.com',
        passwordHash: defaultHash,
        phone: '0898765432',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
        role: UserRole.HOST,
        rating: 5.0,
        reviewCount: 8,
      },
      {
        id: seedIds.users.kittisak,
        name: 'Kittisak Renter',
        email: 'kittisak@example.com',
        passwordHash: defaultHash,
        phone: '0865551234',
        avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=400',
        role: UserRole.RENTER,
        rating: 4.5,
        reviewCount: 3,
      },
    ],
    ['id'],
  );

  return seedIds.users;
}