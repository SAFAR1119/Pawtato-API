import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import {
  StorageProvider,
  StorageUploadInput,
} from '../interfaces/storage-provider.interface';
import { signPrivateFileToken } from '../private-file-token.util';
import { PRIVATE_UPLOADS_ROOT } from '../local-private-storage.util';

@Injectable()
export class LocalDiskStorageProvider implements StorageProvider {
  private readonly root = path.join(process.cwd(), 'uploads');
  private readonly privateRoot = PRIVATE_UPLOADS_ROOT;

  constructor(private readonly configService: ConfigService) {}

  async upload({
    buffer,
    folder,
    originalName,
    filename,
  }: StorageUploadInput): Promise<string> {
    return this.write(this.root, { buffer, folder, originalName, filename });
  }

  async uploadPrivate({
    buffer,
    folder,
    originalName,
    filename,
  }: StorageUploadInput): Promise<string> {
    return this.write(this.privateRoot, {
      buffer,
      folder,
      originalName,
      filename,
    });
  }

  private async write(
    root: string,
    {
      buffer,
      folder,
      originalName,
      filename,
    }: Pick<
      StorageUploadInput,
      'buffer' | 'folder' | 'originalName' | 'filename'
    >,
  ): Promise<string> {
    const dir = path.join(root, folder);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const resolvedFilename =
      filename ?? `${Date.now()}-${randomUUID()}${path.extname(originalName)}`;

    const key = `${folder}/${resolvedFilename}`;

    await fs.promises.writeFile(path.join(root, key), buffer);

    return key;
  }

  getUrl(key: string): string {
    return `/uploads/${key}`;
  }

  getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const secret = this.configService.getOrThrow<string>('jwt.secret');
    const token = signPrivateFileToken(secret, key, expiresInSeconds);
    const appUrl = this.configService.get<string>('app.url') ?? '';
    const apiPrefix = this.configService.get<string>('app.apiPrefix') ?? 'api';

    return Promise.resolve(
      `${appUrl.replace(/\/$/, '')}/${apiPrefix}/storage/private/${token}`,
    );
  }

  async delete(key: string): Promise<void> {
    await this.unlinkIfExists(path.join(this.root, key));
  }

  async deleteByUrl(url: string): Promise<void> {
    const prefix = '/uploads/';

    if (!url.startsWith(prefix)) {
      return;
    }

    await this.delete(url.slice(prefix.length));
  }

  // Deletes a private object by its raw key (never a URL — private keys
  // never have one). Used by IdentityVerificationService's cascade delete.
  async deletePrivate(key: string): Promise<void> {
    await this.unlinkIfExists(path.join(this.privateRoot, key));
  }

  private async unlinkIfExists(filePath: string): Promise<void> {
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
