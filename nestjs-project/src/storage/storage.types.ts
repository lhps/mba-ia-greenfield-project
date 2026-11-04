export interface PresignedUrl {
  url: string;
  expiresAt: Date;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export interface PresignGetOptions {
  downloadFileName?: string;
}
