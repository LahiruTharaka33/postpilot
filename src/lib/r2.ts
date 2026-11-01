import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Cloudflare R2 settings, or null when they aren't all set (local development without R2). */
export function r2Config() {
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL, R2_PREFIX } = process.env;
  if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_URL) return null;
  return {
    endpoint: R2_ENDPOINT,
    bucket: R2_BUCKET,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    publicUrl: R2_PUBLIC_URL.replace(/\/$/, ""),
    // Keeps files from local development apart from production's in the same bucket.
    prefix: R2_PREFIX ? `${R2_PREFIX.replace(/\/$/, "")}/` : "",
  };
}

export type R2Config = NonNullable<ReturnType<typeof r2Config>>;

function client(config: R2Config) {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // The SDK's default checksums aren't supported by R2 for browser uploads through signed URLs.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/** Everything a workspace uploads lives under this prefix. */
export function workspacePrefix(config: R2Config, workspaceId: string) {
  return `${config.prefix}${workspaceId}/`;
}

/** A short-lived URL the browser can PUT exactly this file to: the type and size are part of the signature. */
export function presignUpload(config: R2Config, key: string, contentType: string, size: number) {
  return getSignedUrl(
    client(config),
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: 15 * 60, signableHeaders: new Set(["content-type", "content-length"]) },
  );
}

export async function headObject(config: R2Config, key: string) {
  const res = await client(config).send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? "" };
}

export function deleteObject(config: R2Config, key: string) {
  return client(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

export function publicUrl(config: R2Config, key: string) {
  return `${config.publicUrl}/${key}`;
}
