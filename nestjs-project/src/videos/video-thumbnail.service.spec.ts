import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  InvalidThumbnailException,
  VideoAccessDeniedException,
} from '../common/exceptions/domain.exception';
import { FfmpegService } from '../media/ffmpeg.service';
import { MediaProcessError } from '../media/process-runner';
import { StorageService } from '../storage/storage.service';
import { Video } from './entities/video.entity';
import { ThumbnailUrlResolver } from './thumbnail-url.resolver';
import { VideoAccessService } from './video-access.service';
import {
  VideoThumbnailService,
  type UploadedImage,
} from './video-thumbnail.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);
const image = (buffer: Buffer): UploadedImage => ({
  buffer,
  size: buffer.length,
});

describe('VideoThumbnailService', () => {
  let service: VideoThumbnailService;
  const video = { id: 'video-id', public_id: 'AbC_def-123' } as Video;
  const calls: string[] = [];
  const manager = { findOne: jest.fn(), update: jest.fn() };
  const repo = {
    manager: {
      transaction: jest.fn((cb: (m: typeof manager) => Promise<unknown>) =>
        cb(manager),
      ),
    },
  };
  const access = { findOwnedOrFail: jest.fn() };
  const storage = { uploadFile: jest.fn(), deleteObject: jest.fn() };
  const ffmpeg = { normalizeThumbnail: jest.fn() };
  const thumbnails = { resolve: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    calls.length = 0;
    access.findOwnedOrFail.mockResolvedValue(video);
    ffmpeg.normalizeThumbnail.mockResolvedValue(undefined);
    storage.uploadFile.mockImplementation((_p: string, key: string) => {
      calls.push(`upload:${key}`);
      return Promise.resolve();
    });
    storage.deleteObject.mockImplementation((key: string) => {
      calls.push(`delete:${key}`);
      return Promise.resolve();
    });
    manager.findOne.mockResolvedValue({ thumbnail_key: 'thumbnails/old.jpg' });
    manager.update.mockImplementation(() => {
      calls.push('update');
      return Promise.resolve({ affected: 1 });
    });
    thumbnails.resolve.mockImplementation((key: string) =>
      Promise.resolve(`http://public/${key}`),
    );

    const module = await Test.createTestingModule({
      providers: [
        VideoThumbnailService,
        { provide: getRepositoryToken(Video), useValue: repo },
        { provide: VideoAccessService, useValue: access },
        { provide: StorageService, useValue: storage },
        { provide: FfmpegService, useValue: ffmpeg },
        { provide: ThumbnailUrlResolver, useValue: thumbnails },
      ],
    }).compile();
    service = module.get(VideoThumbnailService);
  });

  it('should propagate ownership errors before touching the file', async () => {
    access.findOwnedOrFail.mockRejectedValue(new VideoAccessDeniedException());

    await expect(
      service.replace('AbC_def-123', 'other', image(PNG)),
    ).rejects.toBeInstanceOf(VideoAccessDeniedException);
    expect(ffmpeg.normalizeThumbnail).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing file', undefined],
    ['a text file', image(Buffer.from('hello, not an image'))],
    ['an empty file', image(Buffer.alloc(0))],
  ])(
    'should reject %s with INVALID_THUMBNAIL without running ffmpeg',
    async (_label, file) => {
      await expect(
        service.replace('AbC_def-123', 'owner', file),
      ).rejects.toBeInstanceOf(InvalidThumbnailException);
      expect(ffmpeg.normalizeThumbnail).not.toHaveBeenCalled();
      expect(storage.uploadFile).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['JPEG', JPEG],
    ['PNG', PNG],
    ['WebP', WEBP],
  ])('should accept a %s signature', async (_label, bytes) => {
    await service.replace('AbC_def-123', 'owner', image(bytes));

    expect(ffmpeg.normalizeThumbnail).toHaveBeenCalledTimes(1);
  });

  it('should map an ffmpeg decode failure to INVALID_THUMBNAIL and store nothing', async () => {
    ffmpeg.normalizeThumbnail.mockRejectedValue(
      new MediaProcessError('ffmpeg', 1, 'Invalid data', 'exited with code 1'),
    );

    await expect(
      service.replace('AbC_def-123', 'owner', image(JPEG)),
    ).rejects.toBeInstanceOf(InvalidThumbnailException);
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('should propagate unexpected normalize errors unchanged', async () => {
    const boom = new Error('disk full');
    ffmpeg.normalizeThumbnail.mockRejectedValue(boom);

    await expect(
      service.replace('AbC_def-123', 'owner', image(PNG)),
    ).rejects.toBe(boom);
  });

  it('should store a new versioned JPEG, flag it custom, then delete the previous object', async () => {
    const result = await service.replace('AbC_def-123', 'owner', image(PNG));

    const [, key, contentType] = storage.uploadFile.mock.calls[0] as [
      string,
      string,
      string,
    ];
    expect(key).toMatch(/^thumbnails\/video-id\/[A-Za-z0-9_-]{16}\.jpg$/);
    expect(contentType).toBe('image/jpeg');
    expect(manager.findOne).toHaveBeenCalledWith(Video, {
      where: { id: 'video-id' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.update).toHaveBeenCalledWith(Video, 'video-id', {
      thumbnail_key: key,
      has_custom_thumbnail: true,
    });
    expect(calls).toEqual([
      `upload:${key}`,
      'update',
      'delete:thumbnails/old.jpg',
    ]);
    expect(result).toEqual({ thumbnail_url: `http://public/${key}` });
  });

  it('should not delete anything when there was no previous thumbnail', async () => {
    manager.findOne.mockResolvedValue({ thumbnail_key: null });

    await service.replace('AbC_def-123', 'owner', image(PNG));

    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('should delete the new object and keep the previous one when the row update fails', async () => {
    const dbError = new Error('connection lost');
    manager.update.mockRejectedValue(dbError);

    await expect(
      service.replace('AbC_def-123', 'owner', image(PNG)),
    ).rejects.toBe(dbError);

    const [, key] = storage.uploadFile.mock.calls[0] as [string, string];
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).toHaveBeenCalledWith(key);
  });
});
