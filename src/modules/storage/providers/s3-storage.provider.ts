import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as presignS3Url } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { extname } from 'path';

import {
  StorageProvider,
  StorageUploadInput,
} from '../interfaces/storage-provider.interface';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicUrl?: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>('storage.s3.bucket') ?? '';
    this.region = this.configService.get<string>('storage.s3.region') ?? '';
    this.publicUrl = this.configService.get<string>('storage.s3.publicUrl');

    this.client = new S3Client({
      region: this.region,
      endpoint: this.configService.get<string>('storage.s3.endpoint'),
      forcePathStyle: this.configService.get<boolean>(
        'storage.s3.forcePathStyle',
      ),
      credentials: {
        accessKeyId:
          this.configService.get<string>('storage.s3.accessKeyId') ?? '',
        secretAccessKey:
          this.configService.get<string>('storage.s3.secretAccessKey') ?? '',
      },
    });
  }

  async upload({
    buffer,
    folder,
    originalName,
    mimetype,
    filename,
  }: StorageUploadInput): Promise<string> {
    const resolvedFilename =
      filename ?? `${Date.now()}-${randomUUID()}${extname(originalName)}`;

    const key = `${folder}/${resolvedFilename}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      }),
    );

    return key;
  }

  getUrl(key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl.replace(/\/$/, '')}/${key}`;
    }

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  // Same bucket/mechanism as upload() — S3 has no separate "private root"
  // the way local disk does. The privacy guarantee here rests entirely on
  // never calling getUrl()/publicUrl construction for these keys and only
  // ever handing out a presigned getSignedUrl() below. In production this
  // bucket (or at minimum the folder these keys live under, e.g. `nid/`)
  // must NOT have a public-read bucket policy — that's a deployment/infra
  // requirement this code can't enforce, the same class of open item the
  // roadmap already flags for Docker/CI (see PAWTATO_ROADMAP.md Phase 11).
  async uploadPrivate(input: StorageUploadInput): Promise<string> {
    return this.upload(input);
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return presignS3Url(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async deletePrivate(key: string): Promise<void> {
    await this.delete(key);
  }

  async deleteByUrl(url: string): Promise<void> {
    const key = this.getKeyFromUrl(url);

    if (key) {
      await this.delete(key);
    }
  }

  private getKeyFromUrl(url: string): string | null {
    const prefix = this.publicUrl
      ? `${this.publicUrl.replace(/\/$/, '')}/`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/`;

    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
  }
}
