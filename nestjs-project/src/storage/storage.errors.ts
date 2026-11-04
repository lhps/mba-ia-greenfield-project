/**
 * Raised when storage rejects CompleteMultipartUpload because the declared
 * parts do not match what was uploaded. The upload stays resumable.
 */
export class MultipartCompletionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MultipartCompletionError';
  }
}
