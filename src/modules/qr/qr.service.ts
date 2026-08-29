import { Inject, Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

import { STORAGE_PROVIDER } from '../storage/storage.constants';
import type { StorageProvider } from '../storage/interfaces/storage-provider.interface';

@Injectable()
export class QrService {
  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  // Called once at tag creation; the image stays valid across reassignment
  // since scans resolve tag -> current pet dynamically. `linkUrl` is built by
  // the caller (TagsService), not this service — the frontend supplies the
  // route it wants encoded, this just renders/stores the pixels.
  async generate(publicCode: string, linkUrl: string) {
    const buffer = await QRCode.toBuffer(linkUrl, {
      width: 400,
    });

    const filename = `${publicCode}.png`;

    const key = await this.storageProvider.upload({
      buffer,
      folder: 'qrcodes',
      originalName: filename,
      mimetype: 'image/png',
      filename,
    });

    return this.storageProvider.getUrl(key);
  }

  // The storage key is deterministic from publicCode (see generate() above),
  // so tag deletion doesn't need to persist it separately just to clean up.
  async delete(publicCode: string) {
    await this.storageProvider.delete(`qrcodes/${publicCode}.png`);
  }
}
