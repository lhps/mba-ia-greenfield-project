import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import storageConfig from '../config/storage.config';
import uploadConfig from '../config/upload.config';
import {
  MULTIPART_COMPLETION_ERROR_CODES,
  NO_SUCH_UPLOAD,
  S3_CLIENTS,
} from './storage.constants';
import { MultipartCompletionError } from './storage.errors';
import type {
  CompletedPart,
  PresignGetOptions,
  PresignedUrl,
} from './storage.types';

@Injectable()
export class StorageService {
  constructor(
    @Inject(S3_CLIENTS.INTERNAL) private readonly internalClient: S3Client,
    @Inject(S3_CLIENTS.PUBLIC) private readonly publicClient: S3Client,
    @Inject(storageConfig.KEY)
    private readonly storage: ConfigType<typeof storageConfig>,
    @Inject(uploadConfig.KEY)
    private readonly upload: ConfigType<typeof uploadConfig>,
  ) {}

  async createMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<string> {
    const { UploadId } = await this.internalClient.send(
      new CreateMultipartUploadCommand({
        Bucket: this.storage.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!UploadId) throw new Error(`Storage returned no UploadId for ${key}`);
    return UploadId;
  }

  async presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
  ): Promise<PresignedUrl> {
    const expiresIn = this.upload.presignedUrlTtlSeconds;
    const url = await getSignedUrl(
      this.publicClient,
      new UploadPartCommand({
        Bucket: this.storage.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn },
    );
    return this.withExpiry(url, expiresIn);
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    try {
      await this.internalClient.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.storage.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: [...parts]
              .sort((a, b) => a.partNumber - b.partNumber)
              .map((part) => ({
                PartNumber: part.partNumber,
                ETag: part.etag,
              })),
          },
        }),
      );
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        MULTIPART_COMPLETION_ERROR_CODES.has(error.name)
      ) {
        throw new MultipartCompletionError(error.name, error.message);
      }
      throw error;
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      await this.internalClient.send(
        new AbortMultipartUploadCommand({
          Bucket: this.storage.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (error) {
      if (error instanceof S3ServiceException && error.name === NO_SUCH_UPLOAD)
        return;
      throw error;
    }
  }

  async headObject(key: string): Promise<{ contentLength: number }> {
    const { ContentLength } = await this.internalClient.send(
      new HeadObjectCommand({ Bucket: this.storage.bucket, Key: key }),
    );
    return { contentLength: ContentLength ?? 0 };
  }

  async presignGetObject(
    key: string,
    options: PresignGetOptions = {},
  ): Promise<PresignedUrl> {
    const expiresIn = this.upload.presignedUrlTtlSeconds;
    const url = await getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.storage.bucket,
        Key: key,
        ResponseContentDisposition: options.downloadFileName
          ? `attachment; filename="${options.downloadFileName}"`
          : undefined,
      }),
      { expiresIn },
    );
    return this.withExpiry(url, expiresIn);
  }

  /** Stable unsigned URL; readable anonymously only for keys under `PUBLIC_READ_PREFIX`. */
  publicObjectUrl(key: string): string {
    const endpoint = this.storage.publicEndpoint.replace(/\/+$/, '');
    return `${endpoint}/${this.storage.bucket}/${key}`;
  }

  async downloadToFile(key: string, path: string): Promise<void> {
    const { Body } = await this.internalClient.send(
      new GetObjectCommand({ Bucket: this.storage.bucket, Key: key }),
    );
    if (!Body) throw new Error(`Storage returned no body for ${key}`);
    await pipeline(Body as Readable, createWriteStream(path));
  }

  /**
   * Uploads a local file with multipart parts of `UPLOAD_PART_SIZE_BYTES`,
   * so outputs above the 5 GiB single-PUT limit are supported.
   */
  async uploadFile(
    path: string,
    key: string,
    contentType: string,
  ): Promise<void> {
    const { size } = await stat(path);
    const partSize = this.upload.partSizeBytes;
    const uploadId = await this.createMultipartUpload(key, contentType);

    try {
      const parts: CompletedPart[] = [];
      const partCount = Math.max(1, Math.ceil(size / partSize));
      for (let index = 0; index < partCount; index++) {
        const start = index * partSize;
        const end = Math.min(start + partSize, size);
        const { ETag } = await this.internalClient.send(
          new UploadPartCommand({
            Bucket: this.storage.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: index + 1,
            ContentLength: end - start,
            Body:
              end > start
                ? createReadStream(path, { start, end: end - 1 })
                : Buffer.alloc(0),
          }),
        );
        parts.push({ partNumber: index + 1, etag: ETag ?? '' });
      }
      await this.completeMultipartUpload(key, uploadId, parts);
    } catch (error) {
      await this.abortMultipartUpload(key, uploadId);
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.internalClient.send(
      new DeleteObjectCommand({ Bucket: this.storage.bucket, Key: key }),
    );
  }

  private withExpiry(url: string, expiresInSeconds: number): PresignedUrl {
    return { url, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
  }
}
