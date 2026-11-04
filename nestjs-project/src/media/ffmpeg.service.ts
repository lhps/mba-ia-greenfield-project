import { Injectable } from '@nestjs/common';
import { ProcessRunner } from './process-runner';

const PROBE_TIMEOUT_MS = 60_000;
const ENCODE_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const THUMBNAIL_TIMEOUT_MS = 120_000;
const CUSTOM_THUMBNAIL_TIMEOUT_MS = 30_000;

/** Uniform 16:9 custom-thumbnail output (TD-06). */
export const NORMALIZED_THUMBNAIL = { WIDTH: 1280, HEIGHT: 720 } as const;

export interface ProbeResult {
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  has_video: boolean;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string };
}

@Injectable()
export class FfmpegService {
  constructor(private readonly runner: ProcessRunner) {}

  async probe(path: string): Promise<ProbeResult> {
    const { stdout } = await this.runner.run(
      'ffprobe',
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        path,
      ],
      { timeoutMs: PROBE_TIMEOUT_MS },
    );
    const output = JSON.parse(stdout) as FfprobeOutput;
    const streams = output.streams ?? [];
    const video = streams.find((s) => s.codec_type === 'video');
    const audio = streams.find((s) => s.codec_type === 'audio');
    const duration = Number(output.format?.duration);

    return {
      duration_seconds: Number.isFinite(duration) ? duration : null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      video_codec: video?.codec_name ?? null,
      audio_codec: audio?.codec_name ?? null,
      has_video: Boolean(video),
    };
  }

  /** H.264 video with AAC (or no) audio can be remuxed without re-encoding. */
  isBrowserPlayable(probe: ProbeResult): boolean {
    return (
      probe.video_codec === 'h264' &&
      (probe.audio_codec === null || probe.audio_codec === 'aac')
    );
  }

  async toFaststartMp4(
    input: string,
    output: string,
    options: { transcode: boolean },
  ): Promise<void> {
    const codecArgs = options.transcode
      ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac']
      : ['-c', 'copy'];
    await this.runner.run(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-i',
        input,
        ...codecArgs,
        '-movflags',
        '+faststart',
        output,
      ],
      { timeoutMs: ENCODE_TIMEOUT_MS },
    );
  }

  async extractThumbnail(
    input: string,
    output: string,
    atSeconds: number,
  ): Promise<void> {
    await this.runner.run(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-ss',
        atSeconds.toFixed(3),
        '-i',
        input,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        output,
      ],
      { timeoutMs: THUMBNAIL_TIMEOUT_MS },
    );
  }

  /**
   * Re-encodes an uploaded image into a 1280×720 JPEG: scale to cover, then
   * center-crop, dropping metadata (EXIF). Strict decoding (`-xerror`,
   * `-err_detect explode`) makes truncated or corrupt input fail instead of
   * producing a partially decoded frame; failures surface as `MediaProcessError`.
   */
  async normalizeThumbnail(input: string, output: string): Promise<void> {
    const { WIDTH, HEIGHT } = NORMALIZED_THUMBNAIL;
    await this.runner.run(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-xerror',
        '-err_detect',
        'explode',
        '-i',
        input,
        '-frames:v',
        '1',
        '-vf',
        `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},format=yuvj420p`,
        '-map_metadata',
        '-1',
        '-q:v',
        '3',
        '-f',
        'image2',
        '-c:v',
        'mjpeg',
        output,
      ],
      { timeoutMs: CUSTOM_THUMBNAIL_TIMEOUT_MS },
    );
  }
}
