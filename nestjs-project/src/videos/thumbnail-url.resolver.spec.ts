import { Test } from '@nestjs/testing';
import { StorageService } from '../storage/storage.service';
import { ThumbnailUrlResolver } from './thumbnail-url.resolver';

describe('ThumbnailUrlResolver', () => {
  const storage = {
    publicObjectUrl: jest.fn(),
    presignGetObject: jest.fn(),
  };
  let resolver: ThumbnailUrlResolver;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ThumbnailUrlResolver,
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    resolver = moduleRef.get(ThumbnailUrlResolver);
  });

  it('should return the stable public URL for keys under thumbnails/', async () => {
    const key = 'thumbnails/video-id/AbCdEf123456.jpg';
    const publicUrl = `http://localhost:8333/streamtube-videos/${key}`;
    storage.publicObjectUrl.mockReturnValue(publicUrl);

    await expect(resolver.resolve(key)).resolves.toBe(publicUrl);
    expect(storage.publicObjectUrl).toHaveBeenCalledWith(key);
    expect(storage.presignGetObject).not.toHaveBeenCalled();
  });

  it('should presign a GET for legacy Phase 03 thumbnail keys', async () => {
    const legacyKey = 'videos/video-id/thumbnail.jpg';
    storage.presignGetObject.mockResolvedValue({
      url: 'http://localhost:8333/streamtube-videos/videos/video-id/thumbnail.jpg?X-Amz-Signature=sig',
      expiresAt: new Date(),
    });

    await expect(resolver.resolve(legacyKey)).resolves.toContain(
      'X-Amz-Signature=sig',
    );
    expect(storage.presignGetObject).toHaveBeenCalledWith(legacyKey);
    expect(storage.publicObjectUrl).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ''])(
    'should return null when the thumbnail key is %p',
    async (key) => {
      await expect(resolver.resolve(key)).resolves.toBeNull();
      expect(storage.publicObjectUrl).not.toHaveBeenCalled();
      expect(storage.presignGetObject).not.toHaveBeenCalled();
    },
  );
});
