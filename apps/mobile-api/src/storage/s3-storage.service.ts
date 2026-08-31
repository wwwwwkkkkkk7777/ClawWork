import {
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";

function requiredEndpoint() {
  const endpoint = process.env.MINIO_ENDPOINT?.trim();
  if (!endpoint) throw new Error("MINIO_ENDPOINT is required");
  return endpoint;
}

function credentials() {
  const accessKeyId =
    process.env.S3_ACCESS_KEY?.trim() ||
    process.env.MINIO_ACCESS_KEY?.trim() ||
    process.env.MINIO_ROOT_USER?.trim() ||
    "minioadmin";
  const secretAccessKey =
    process.env.S3_SECRET_KEY?.trim() ||
    process.env.MINIO_SECRET_KEY?.trim() ||
    process.env.MINIO_ROOT_PASSWORD?.trim() ||
    "minioadmin";
  return { accessKeyId, secretAccessKey };
}

function asBoolean(value: string | undefined, fallback: boolean) {
  if (value?.toLowerCase() === "true") return true;
  if (value?.toLowerCase() === "false") return false;
  return fallback;
}

@Injectable()
export class S3StorageService {
  private readonly bucket = process.env.S3_BUCKET?.trim() || "clawwork";
  private readonly expiresIn = Number(process.env.S3_PRESIGN_TTL_SECONDS) || 900;
  private readonly internalClient = this.createClient(requiredEndpoint());
  private readonly publicClient = this.createClient(
    process.env.S3_PUBLIC_ENDPOINT?.trim() || requiredEndpoint()
  );

  private createClient(endpoint: string) {
    return new S3Client({
      endpoint,
      region: process.env.S3_REGION?.trim() || "us-east-1",
      credentials: credentials(),
      forcePathStyle: asBoolean(process.env.S3_FORCE_PATH_STYLE, true)
    });
  }

  async ensureBucket() {
    try {
      await this.internalClient.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (!asBoolean(process.env.S3_AUTO_CREATE_BUCKET, false)) throw error;
      try {
        await this.internalClient.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (createError) {
        const name = createError instanceof Error ? createError.name : "";
        if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") {
          throw createError;
        }
      }
    }
  }

  async createUploadUrl(key: string, mimeType: string, sizeBytes: number) {
    try {
      return await getSignedUrl(
        this.publicClient,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: mimeType,
          ContentLength: sizeBytes
        }),
        { expiresIn: this.expiresIn }
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error ? `object storage unavailable: ${error.message}` : "object storage unavailable"
      );
    }
  }

  async inspectObject(key: string) {
    try {
      const result = await this.internalClient.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return {
        sizeBytes: result.ContentLength,
        mimeType: result.ContentType,
        etag: result.ETag?.replace(/^\"|\"$/g, "")
      };
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error ? `uploaded object is unavailable: ${error.message}` : "uploaded object is unavailable"
      );
    }
  }

  createDownloadUrl(key: string, publicUrl = true) {
    return getSignedUrl(
      publicUrl ? this.publicClient : this.internalClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: this.expiresIn }
    );
  }

  async putObject(key: string, body: Uint8Array, mimeType: string) {
    try {
      const result = await this.internalClient.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: mimeType,
          ContentLength: body.byteLength
        })
      );
      return { etag: result.ETag?.replace(/^\"|\"$/g, "") };
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error
          ? `failed to archive result: ${error.message}`
          : "failed to archive result"
      );
    }
  }

  async deleteObject(key: string) {
    try {
      await this.internalClient.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error
          ? `failed to delete stored object: ${error.message}`
          : "failed to delete stored object"
      );
    }
  }

  async ready() {
    await this.internalClient.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  destroy() {
    this.internalClient.destroy();
    this.publicClient.destroy();
  }
}
