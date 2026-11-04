import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FfmpegService } from './ffmpeg.service';
import { MediaProcessError, ProcessRunner } from './process-runner';

const FIXTURES = join(__dirname, '..', '..', 'test', 'fixtures');

describe('FfmpegService (integration, real ffmpeg)', () => {
  const service = new FfmpegService(new ProcessRunner());
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ffmpeg-it-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('should probe the fixture metadata', async () => {
    const probe = await service.probe(join(FIXTURES, 'sample.mp4'));

    expect(probe.duration_seconds).toBeCloseTo(2, 0);
    expect(probe).toMatchObject({
      width: 320,
      height: 240,
      video_codec: 'h264',
      audio_codec: 'aac',
      has_video: true,
    });
    expect(service.isBrowserPlayable(probe)).toBe(true);
  });

  it.each([false, true])(
    'should write a faststart MP4 (moov before mdat) with transcode=%s',
    async (transcode) => {
      const output = join(dir, `faststart-${transcode}.mp4`);
      await service.toFaststartMp4(join(FIXTURES, 'sample.mp4'), output, {
        transcode,
      });

      const bytes = await readFile(output);
      const moov = bytes.indexOf('moov');
      const mdat = bytes.indexOf('mdat');
      expect(moov).toBeGreaterThan(-1);
      expect(moov).toBeLessThan(mdat);
    },
  );

  it('should extract a JPEG thumbnail', async () => {
    const output = join(dir, 'thumb.jpg');
    await service.extractThumbnail(join(FIXTURES, 'sample.mp4'), output, 0.2);

    const bytes = await readFile(output);
    expect((await stat(output)).size).toBeGreaterThan(0);
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it('should fail with a typed error (never crash) for a non-video file', async () => {
    const result = await service.probe(join(FIXTURES, 'not-a-video.mp4')).then(
      (probe) => probe.has_video,
      (error: unknown) => error,
    );

    if (result instanceof Error) {
      expect(result).toBeInstanceOf(MediaProcessError);
    } else {
      expect(result).toBe(false);
    }
  });

  it('should normalize a non-16:9 PNG into a 1280x720 JPEG', async () => {
    const output = join(dir, 'normalized.jpg');
    await service.normalizeThumbnail(join(FIXTURES, 'thumbnail.png'), output);

    const bytes = await readFile(output);
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    const probe = await service.probe(output);
    expect(probe).toMatchObject({
      width: 1280,
      height: 720,
      video_codec: 'mjpeg',
    });
  });

  it('should fail with MediaProcessError for a truncated JPEG', async () => {
    await expect(
      service.normalizeThumbnail(
        join(FIXTURES, 'thumbnail-invalid.jpg'),
        join(dir, 'invalid.jpg'),
      ),
    ).rejects.toBeInstanceOf(MediaProcessError);
  });
});
