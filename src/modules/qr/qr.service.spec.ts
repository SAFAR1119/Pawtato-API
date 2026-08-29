import { Test, TestingModule } from '@nestjs/testing';
import { QrService } from './qr.service';
import { STORAGE_PROVIDER } from '../storage/storage.constants';

describe('QrService', () => {
  let service: QrService;
  let storageProvider: {
    upload: jest.Mock;
    getUrl: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    storageProvider = {
      upload: jest.fn().mockResolvedValue('qrcodes/ABC123.png'),
      getUrl: jest.fn().mockReturnValue('/uploads/qrcodes/ABC123.png'),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QrService,
        { provide: STORAGE_PROVIDER, useValue: storageProvider },
      ],
    }).compile();

    service = module.get<QrService>(QrService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generate', () => {
    it('encodes the caller-supplied link, uploads under a deterministic filename, and returns the resolved URL', async () => {
      const url = await service.generate(
        'ABC123',
        'https://pawtato.ariyan.app/qr/ABC123',
      );

      expect(storageProvider.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'qrcodes',
          filename: 'ABC123.png',
          originalName: 'ABC123.png',
          mimetype: 'image/png',
          buffer: expect.any(Buffer) as Buffer,
        }),
      );
      expect(storageProvider.getUrl).toHaveBeenCalledWith('qrcodes/ABC123.png');
      expect(url).toBe('/uploads/qrcodes/ABC123.png');
    });
  });

  describe('delete', () => {
    it('deletes the deterministic storage key derived from the public code', async () => {
      await service.delete('ABC123');

      expect(storageProvider.delete).toHaveBeenCalledWith('qrcodes/ABC123.png');
    });
  });
});
