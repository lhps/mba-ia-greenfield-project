import { Module } from '@nestjs/common';
import { FfmpegService } from './ffmpeg.service';
import { ProcessRunner } from './process-runner';

@Module({
  providers: [ProcessRunner, FfmpegService],
  exports: [FfmpegService],
})
export class MediaModule {}
