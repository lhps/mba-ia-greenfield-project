import { type ArgumentsHost, PayloadTooLargeException } from '@nestjs/common';
import { ThumbnailTooLargeFilter } from './thumbnail-too-large.filter';

describe('ThumbnailTooLargeFilter', () => {
  it('maps a Multer PayloadTooLargeException to 413 THUMBNAIL_TOO_LARGE', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    new ThumbnailTooLargeFilter().catch(
      new PayloadTooLargeException('File too large'),
      host,
    );

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      statusCode: 413,
      error: 'THUMBNAIL_TOO_LARGE',
      message: 'Thumbnail exceeds the maximum allowed size',
    });
  });
});
