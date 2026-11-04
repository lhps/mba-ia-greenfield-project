import { FfmpegService } from './ffmpeg.service';
import type { ProcessRunner } from './process-runner';

describe('FfmpegService', () => {
  const runner = { run: jest.fn() };
  const service = new FfmpegService(runner as unknown as ProcessRunner);

  beforeEach(() => jest.clearAllMocks());

  const probeOutput = (streams: object[], duration?: string) =>
    runner.run.mockResolvedValue({
      stdout: JSON.stringify({ streams, format: { duration } }),
      stderr: '',
    });

  it('should map ffprobe JSON into a ProbeResult', async () => {
    probeOutput(
      [
        { codec_type: 'video', codec_name: 'h264', width: 320, height: 240 },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
      '2.040000',
    );

    await expect(service.probe('/tmp/in')).resolves.toEqual({
      duration_seconds: 2.04,
      width: 320,
      height: 240,
      video_codec: 'h264',
      audio_codec: 'aac',
      has_video: true,
    });
  });

  it('should report no audio and no video streams', async () => {
    probeOutput([
      { codec_type: 'video', codec_name: 'vp9', width: 1, height: 1 },
    ]);
    await expect(service.probe('/tmp/in')).resolves.toMatchObject({
      audio_codec: null,
      duration_seconds: null,
      has_video: true,
    });

    probeOutput([{ codec_type: 'audio', codec_name: 'mp3' }], '3');
    await expect(service.probe('/tmp/in')).resolves.toMatchObject({
      has_video: false,
      width: null,
      video_codec: null,
    });
  });

  it.each([
    ['h264', 'aac', true],
    ['h264', null, true],
    ['h264', 'opus', false],
    ['vp9', 'aac', false],
  ])('isBrowserPlayable(%s, %s) = %s', (video_codec, audio_codec, expected) => {
    expect(
      service.isBrowserPlayable({
        video_codec,
        audio_codec,
        duration_seconds: 1,
        width: 1,
        height: 1,
        has_video: true,
      }),
    ).toBe(expected);
  });

  it('should remux with stream copy and faststart when no transcode is needed', async () => {
    runner.run.mockResolvedValue({ stdout: '', stderr: '' });
    await service.toFaststartMp4('in', 'out.mp4', { transcode: false });

    const [cmd, args] = runner.run.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('ffmpeg');
    expect(args).toEqual(
      expect.arrayContaining(['-c', 'copy', '-movflags', '+faststart']),
    );
    expect(args).not.toContain('libx264');
    expect(args[args.length - 1]).toBe('out.mp4');
  });

  it('should transcode to H.264/AAC when requested', async () => {
    runner.run.mockResolvedValue({ stdout: '', stderr: '' });
    await service.toFaststartMp4('in', 'out.mp4', { transcode: true });

    const [, args] = runner.run.mock.calls[0] as [string, string[]];
    expect(args).toEqual(
      expect.arrayContaining(['-c:v', 'libx264', '-c:a', 'aac', '+faststart']),
    );
    expect(args).not.toContain('copy');
  });

  it('should seek before extracting a single thumbnail frame', async () => {
    runner.run.mockResolvedValue({ stdout: '', stderr: '' });
    await service.extractThumbnail('in', 'thumb.jpg', 0.2);

    const [, args] = runner.run.mock.calls[0] as [string, string[]];
    expect(args).toEqual(
      expect.arrayContaining(['-ss', '0.200', '-frames:v', '1']),
    );
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
  });
});
