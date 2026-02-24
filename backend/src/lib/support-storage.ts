import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

function getAwsRegion(): string {
  const region = (process.env.AWS_REGION || '').trim();
  if (!region) {
    throw new Error('Missing AWS_REGION');
  }
  return region;
}

function getSupportUploadsBucket(): string {
  const bucket = (process.env.SUPPORT_UPLOADS_BUCKET || '').trim();
  if (!bucket) {
    throw new Error('Missing SUPPORT_UPLOADS_BUCKET');
  }
  return bucket;
}

function getSupportUploadsPrefix(): string {
  const prefix = (process.env.SUPPORT_UPLOADS_PREFIX || 'support-uploads').trim();
  return prefix.replace(/^\/+|\/+$/g, '');
}

function sanitizeFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  return lower.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').slice(-80);
}

function buildObjectKey(originalName: string): string {
  const datePrefix = new Date().toISOString().slice(0, 10);
  const safeName = sanitizeFileName(originalName || 'attachment');
  return `${getSupportUploadsPrefix()}/${datePrefix}/${randomUUID()}-${safeName}`;
}

function getS3Client(): S3Client {
  return new S3Client({ region: getAwsRegion() });
}

export function isSupportedAttachmentMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.has((mimeType || '').toLowerCase());
}

export async function uploadSupportAttachment(params: {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<{ key: string; signedUrl: string }> {
  const bucket = getSupportUploadsBucket();
  const key = buildObjectKey(params.fileName);
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: params.fileBuffer,
      ContentType: params.mimeType || 'application/octet-stream',
    })
  );

  const encodedKey = key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const signedUrl = `https://${bucket}.s3.${getAwsRegion()}.amazonaws.com/${encodedKey}`;

  return { key, signedUrl };
}
