import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const region =
  process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
const bucketName =
  process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME || '';
const accessKeyId =
  process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || '';
const secretAccessKey =
  process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || '';
const endpoint =
  process.env.AWS_S3_ENDPOINT || process.env.S3_ENDPOINT || undefined;
const forcePathStyle =
  (process.env.AWS_S3_FORCE_PATH_STYLE || process.env.S3_FORCE_PATH_STYLE) === 'true';
const publicDomain =
  process.env.AWS_S3_PUBLIC_DOMAIN || process.env.S3_PUBLIC_DOMAIN || undefined;

let s3ClientInstance: S3Client | null = null;

export function isS3Configured(): boolean {
  return Boolean(bucketName && accessKeyId && secretAccessKey);
}

export function getS3Client(): S3Client | null {
  if (!isS3Configured()) {
    return null;
  }
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region,
      endpoint,
      forcePathStyle,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return s3ClientInstance;
}

/**
 * Extracts the S3 Key if given either a full URL or an S3 key.
 */
export function extractS3Key(keyOrUrl: string): string {
  if (!keyOrUrl) return '';
  if (!keyOrUrl.startsWith('http://') && !keyOrUrl.startsWith('https://')) {
    return keyOrUrl.replace(/^\/+/, '');
  }
  try {
    const url = new URL(keyOrUrl);
    // Pathname starts with '/', remove it
    let pathName = url.pathname.replace(/^\/+/, '');
    // If path style: /bucketName/key
    if (bucketName && pathName.startsWith(`${bucketName}/`)) {
      pathName = pathName.slice(bucketName.length + 1);
    }
    return decodeURIComponent(pathName);
  } catch {
    return keyOrUrl;
  }
}

/**
 * Uploads a PDF Buffer to AWS S3.
 * Returns the public or S3 URL of the uploaded file.
 * Returns null if S3 is not configured or if an error occurs.
 */
export async function uploadPdfToS3(
  buffer: Buffer,
  s3Key: string,
  contentType = 'application/pdf',
): Promise<string | null> {
  const client = getS3Client();
  if (!client || !bucketName) {
    return null;
  }

  const cleanKey = s3Key.replace(/^\/+/, '');

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: cleanKey,
      Body: buffer,
      ContentType: contentType,
    });

    await client.send(command);

    if (publicDomain) {
      const normalizedDomain = publicDomain.replace(/\/+$/, '');
      return `${normalizedDomain}/${cleanKey}`;
    }

    if (endpoint) {
      const normalizedEndpoint = endpoint.replace(/\/+$/, '');
      return `${normalizedEndpoint}/${bucketName}/${cleanKey}`;
    }

    return `https://${bucketName}.s3.${region}.amazonaws.com/${cleanKey}`;
  } catch (error) {
    console.error(`[S3] Error uploading ${cleanKey} to S3:`, error);
    return null;
  }
}

/**
 * Streams / fetches a PDF Buffer from AWS S3.
 * Returns Buffer or null if not found / S3 unavailable.
 */
export async function getPdfFromS3(keyOrUrl: string): Promise<Buffer | null> {
  const client = getS3Client();
  if (!client || !bucketName) {
    return null;
  }

  const cleanKey = extractS3Key(keyOrUrl);
  if (!cleanKey) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: cleanKey,
    });

    const response = await client.send(command);
    if (!response.Body) {
      return null;
    }

    if (response.Body instanceof Readable) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      return Buffer.concat(chunks);
    } else if (typeof (response.Body as any).transformToByteArray === 'function') {
      const bytes = await (response.Body as any).transformToByteArray();
      return Buffer.from(bytes);
    }

    return null;
  } catch (error: any) {
    if (error?.name !== 'NoSuchKey') {
      console.warn(`[S3] Could not fetch ${cleanKey} from S3:`, error?.message || error);
    }
    return null;
  }
}

/**
 * Deletes a PDF from AWS S3.
 */
export async function deletePdfFromS3(keyOrUrl: string): Promise<boolean> {
  const client = getS3Client();
  if (!client || !bucketName) {
    return false;
  }

  const cleanKey = extractS3Key(keyOrUrl);
  if (!cleanKey) return false;

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: cleanKey,
      }),
    );
    return true;
  } catch (error) {
    console.error(`[S3] Error deleting ${cleanKey} from S3:`, error);
    return false;
  }
}
