import * as fs from 'fs';
import * as path from 'path';
import type { ConfigService } from '@nestjs/config';

import { LocalDiskStorageProvider } from './local-disk-storage.provider';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    writeFile: jest.fn(),
    unlink: jest.fn(),
  },
}));

describe('LocalDiskStorageProvider', () => {
  let provider: LocalDiskStorageProvider;
  let configService: { getOrThrow: jest.Mock; get: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    configService = {
      getOrThrow: jest.fn().mockReturnValue('test-secret'),
      get: jest.fn().mockReturnValue(undefined),
    };
    provider = new LocalDiskStorageProvider(
      configService as unknown as ConfigService,
    );
  });

  describe('upload', () => {
    it('creates the destination folder when it does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await provider.upload({
        buffer: Buffer.from('data'),
        folder: 'avatars',
        originalName: 'photo.png',
        mimetype: 'image/png',
      });

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('avatars'),
        { recursive: true },
      );
    });

    it('skips folder creation when it already exists', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await provider.upload({
        buffer: Buffer.from('data'),
        folder: 'avatars',
        originalName: 'photo.png',
        mimetype: 'image/png',
      });

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('uses an explicit filename verbatim when provided', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const key = await provider.upload({
        buffer: Buffer.from('data'),
        folder: 'qrcodes',
        originalName: 'ABC123.png',
        mimetype: 'image/png',
        filename: 'ABC123.png',
      });

      expect(key).toBe('qrcodes/ABC123.png');
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        path.join(process.cwd(), 'uploads', 'qrcodes', 'ABC123.png'),
        Buffer.from('data'),
      );
    });

    it('generates a random unique filename when none is given', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const key = await provider.upload({
        buffer: Buffer.from('data'),
        folder: 'avatars',
        originalName: 'my photo.jpg',
        mimetype: 'image/jpeg',
      });

      expect(key).toMatch(/^avatars\/\d+-[0-9a-f-]{36}\.jpg$/);
    });
  });

  describe('getUrl', () => {
    it('prefixes the key with /uploads/', () => {
      expect(provider.getUrl('avatars/foo.png')).toBe(
        '/uploads/avatars/foo.png',
      );
    });
  });

  describe('delete', () => {
    it('unlinks the file at the resolved path', async () => {
      (fs.promises.unlink as jest.Mock).mockResolvedValue(undefined);

      await provider.delete('avatars/foo.png');

      expect(fs.promises.unlink).toHaveBeenCalledWith(
        path.join(process.cwd(), 'uploads', 'avatars', 'foo.png'),
      );
    });

    it('swallows ENOENT errors', async () => {
      const error = Object.assign(new Error('not found'), {
        code: 'ENOENT',
      });

      (fs.promises.unlink as jest.Mock).mockRejectedValue(error);

      await expect(
        provider.delete('avatars/missing.png'),
      ).resolves.toBeUndefined();
    });

    it('rethrows non-ENOENT errors', async () => {
      const error = Object.assign(new Error('permission denied'), {
        code: 'EACCES',
      });

      (fs.promises.unlink as jest.Mock).mockRejectedValue(error);

      await expect(provider.delete('avatars/foo.png')).rejects.toThrow(
        'permission denied',
      );
    });
  });

  describe('uploadPrivate', () => {
    it('writes under private-uploads, not uploads', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const key = await provider.uploadPrivate({
        buffer: Buffer.from('data'),
        folder: 'identity-verification',
        originalName: 'nid-front.png',
        mimetype: 'image/png',
        filename: 'nid-front.png',
      });

      expect(key).toBe('identity-verification/nid-front.png');
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        path.join(
          process.cwd(),
          'private-uploads',
          'identity-verification',
          'nid-front.png',
        ),
        Buffer.from('data'),
      );
    });
  });

  describe('getSignedUrl', () => {
    it('returns a URL pointing at the storage/private route with a signed token', async () => {
      configService.get.mockImplementation(
        (key: string) =>
          ({ 'app.url': 'http://localhost:5000', 'app.apiPrefix': 'api' })[key],
      );

      const url = await provider.getSignedUrl(
        'identity-verification/x.png',
        300,
      );

      expect(url).toMatch(
        /^http:\/\/localhost:5000\/api\/storage\/private\/.+$/,
      );
    });
  });

  describe('deletePrivate', () => {
    it('unlinks from private-uploads, not uploads', async () => {
      (fs.promises.unlink as jest.Mock).mockResolvedValue(undefined);

      await provider.deletePrivate('identity-verification/x.png');

      expect(fs.promises.unlink).toHaveBeenCalledWith(
        path.join(
          process.cwd(),
          'private-uploads',
          'identity-verification',
          'x.png',
        ),
      );
    });
  });
});
