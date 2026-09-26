export const seedIds = {
  users: {
    somchai: '00000000-0000-4000-8000-000000000001',
    jane: '00000000-0000-4000-8000-000000000002',
    kittisak: '00000000-0000-4000-8000-000000000003',
  },
  spots: {
    siam: '00000000-0000-4000-8000-000000000011',
    asoke: '00000000-0000-4000-8000-000000000012',
  },
  bookings: {
    siam: '00000000-0000-4000-8000-000000000021',
  },
  payments: {
    siam: '00000000-0000-4000-8000-000000000031',
  },
  reviews: {
    siam: '00000000-0000-4000-8000-000000000041',
  },
  notifications: {
    payment: '00000000-0000-4000-8000-000000000051',
    booking: '00000000-0000-4000-8000-000000000052',
  },
} as const;

export type SeedUserIds = typeof seedIds.users;
export type SeedSpotIds = typeof seedIds.spots;
export type SeedBookingIds = typeof seedIds.bookings;