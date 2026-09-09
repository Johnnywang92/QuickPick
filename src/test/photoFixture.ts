import { LocalPhoto } from '../types/photo';

export function photoFixture(id: string, overrides: Partial<LocalPhoto> = {}): LocalPhoto {
  return {
    id,
    path: `/photos/${id}.jpg`,
    filename: `${id}.jpg`,
    fileSize: 1024,
    format: 'jpeg',
    isRaw: false,
    ...overrides,
  };
}
