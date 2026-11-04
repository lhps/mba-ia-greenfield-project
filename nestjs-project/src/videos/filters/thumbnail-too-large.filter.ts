import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ThumbnailTooLargeException } from '../../common/exceptions/domain.exception';
import { DomainExceptionFilter } from '../../common/filters/domain-exception.filter';

/**
 * Multer's `limits.fileSize` rejects an oversized thumbnail before the handler
 * runs and Nest surfaces it as `PayloadTooLargeException`. Scoped to the
 * thumbnail route, this maps it to the `THUMBNAIL_TOO_LARGE` error envelope.
 */
@Catch(PayloadTooLargeException)
export class ThumbnailTooLargeFilter implements ExceptionFilter {
  private readonly domainFilter = new DomainExceptionFilter();

  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    this.domainFilter.catch(new ThumbnailTooLargeException(), host);
  }
}
