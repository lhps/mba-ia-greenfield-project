import { request } from 'node:http';

export interface PresignedResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

/**
 * Sends a request to a presigned URL signed for S3_PUBLIC_ENDPOINT (host-reachable)
 * from inside the Compose network: connects to S3_ENDPOINT but keeps the signed
 * Host header, so the SigV4 signature stays valid.
 */
export function presignedRequest(
  url: string,
  options: {
    method?: string;
    body?: Buffer;
    headers?: Record<string, string>;
  } = {},
): Promise<PresignedResponse> {
  const signed = new URL(url);
  const internal = new URL(process.env.S3_ENDPOINT!);

  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: internal.hostname,
        port: internal.port,
        method: options.method ?? 'GET',
        path: `${signed.pathname}${signed.search}`,
        headers: {
          ...options.headers,
          host: signed.host,
          ...(options.body ? { 'content-length': options.body.length } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end(options.body);
  });
}
