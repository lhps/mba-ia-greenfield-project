import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CreateVideoUploadDto } from './dto/create-video-upload.dto';
import { VideoUploadStartedDto } from './dto/video-upload-started.dto';
import { VideoUploadService } from './video-upload.service';

const errorSchema = { $ref: getSchemaPath(ApiErrorEnvelope) };

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videoUpload: VideoUploadService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Start a video upload',
    description:
      'Pre-registers the video as a draft under the caller channel and opens a multipart upload. ' +
      'Bytes are sent directly to storage through presigned part URLs.',
  })
  @ApiResponse({ status: 201, type: VideoUploadStartedDto })
  @ApiResponse({ status: 400, description: 'Validation failed', schema: errorSchema })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token', schema: errorSchema })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVideoUploadDto,
  ): Promise<VideoUploadStartedDto> {
    return this.videoUpload.initiate(user.sub, dto);
  }
}
