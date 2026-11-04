export const S3_CLIENTS = {
  INTERNAL: Symbol('S3_INTERNAL_CLIENT'),
  PUBLIC: Symbol('S3_PUBLIC_CLIENT'),
} as const;

export const MULTIPART_COMPLETION_ERROR_CODES = new Set([
  'InvalidPart',
  'InvalidPartOrder',
  'NoSuchUpload',
  'EntityTooSmall',
]);

export const NO_SUCH_UPLOAD = 'NoSuchUpload';

/** Key prefix granted anonymous read by the bucket policy (TD-07). */
export const PUBLIC_READ_PREFIX = 'thumbnails/';
