import { Injectable } from '@nestjs/common';
import { PUBLIC_READ_PREFIX } from '../storage/storage.constants';
import { StorageService } from '../storage/storage.service';

/**
 * Maps a stored `thumbnail_key` to the `thumbnail_url` wire value (TD-07):
 * stable public URL under the public-read prefix, presigned GET for legacy
 * Phase 03 keys (`videos/{id}/thumbnail.jpg`), `null` when there is none.
 */
@Injectable()
export class ThumbnailUrlResolver {
  constructor(private readonly storage: StorageService) {}

  async resolve(
    thumbnailKey: string | null | undefined,
  ): Promise<string | null> {
    if (!thumbnailKey) return null;
    if (thumbnailKey.startsWith(PUBLIC_READ_PREFIX)) {
      return this.storage.publicObjectUrl(thumbnailKey);
    }
    const { url } = await this.storage.presignGetObject(thumbnailKey);
    return url;
  }
}
