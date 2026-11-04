import { S3Client } from '@aws-sdk/client-s3';
import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import storageConfig from '../config/storage.config';
import { S3_CLIENTS } from './storage.constants';
import { StorageService } from './storage.service';

function buildClient(
  storage: ConfigType<typeof storageConfig>,
  endpoint: string,
): S3Client {
  return new S3Client({
    endpoint,
    region: storage.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: storage.accessKey,
      secretAccessKey: storage.secretKey,
    },
    // Presigned browser PUTs fail with 400 BadDigest when the SDK default
    // (WHEN_SUPPORTED) adds CRC32 checksums — see phase-03-videos/TD-04.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

@Module({
  providers: [
    {
      provide: S3_CLIENTS.INTERNAL,
      inject: [storageConfig.KEY],
      useFactory: (storage: ConfigType<typeof storageConfig>) =>
        buildClient(storage, storage.endpoint),
    },
    {
      provide: S3_CLIENTS.PUBLIC,
      inject: [storageConfig.KEY],
      useFactory: (storage: ConfigType<typeof storageConfig>) =>
        buildClient(storage, storage.publicEndpoint),
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule implements OnModuleDestroy {
  constructor(
    @Inject(S3_CLIENTS.INTERNAL) private readonly internalClient: S3Client,
    @Inject(S3_CLIENTS.PUBLIC) private readonly publicClient: S3Client,
  ) {}

  onModuleDestroy(): void {
    this.internalClient.destroy();
    this.publicClient.destroy();
  }
}
