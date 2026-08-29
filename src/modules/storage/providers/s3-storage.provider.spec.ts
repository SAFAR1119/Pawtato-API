import { ConfigService } from '@nestjs/config';

import { S3StorageProvider } from './s3-storage.provider';

interface MockCommandInput {
  input: Record<string, unknown>;
}

const sendMock = jest.fn<Promise<unknown>, [MockCommandInput]>();
const presignMock = jest.fn<Promise<string>, unknown[]>();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: jest
    .fn()
    .mockImplementation((input: Record<string, unknown>): MockCommandInput => ({
      input,
    })),
  DeleteObjectCommand: jest
    .fn()
    .mockImplementation((input: Record<string, unknown>): MockCommandInput => ({
      input,
    })),
  GetObjectCommand: jest
    .fn()
    .mockImplementation((input: Record<string, unknown>): MockCommandInput => ({
      input,
    })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => presignMock(...args),
}));

describe('S3StorageProvider', () => {
  let provider: S3StorageProvider;
  let configService: { get: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'storage.s3.bucket': 'pawtato-media',
          'storage.s3.region': 'us-east-1',
          'storage.s3.publicUrl': undefined,
          'storage.s3.endpoint': undefined,
          'storage.s3.forcePathStyle': undefined,
          'storage.s3.accessKeyId': 'key',
          'storage.s3.secretAccessKey': 'secret',
        };

        return values[key];
      }),
    };

    provider = new S3StorageProvider(configService as unknown as ConfigService);
  });

  describe('upload', () => {
    it('sends a PutObjectCommand and returns the object key', async () => {
      sendMock.mockResolvedValue({});

      const key = await provider.upload({
        buffer: Buffer.from('data'),
        folder: 'avatars',
        originalName: 'photo.png',
        mimetype: 'image/png',
        filename: 'photo.png',
      });

      expect(key).toBe('avatars/photo.png');

      const sentInput = sendMock.mock.calls[0][0].input;

      expect(sentInput).toMatchObject({
        Bucket: 'pawtato-media',
        Key: 'avatars/photo.png',
        ContentType: 'image/png',
      });
    });
  });

  describe('getUrl', () => {
    it('builds a standard S3 URL when no publicUrl is configured', () => {
      expect(provider.getUrl('avatars/photo.png')).toBe(
        'https://pawtato-media.s3.us-east-1.amazonaws.com/avatars/photo.png',
      );
    });

    it('uses the configured publicUrl when present', () => {
      configService.get.mockImplementation((key: string) =>
        key === 'storage.s3.publicUrl'
          ? 'https://cdn.pawtato.app/'
          : key === 'storage.s3.bucket'
            ? 'pawtato-media'
            : key === 'storage.s3.region'
              ? 'us-east-1'
              : undefined,
      );

      const cdnProvider = new S3StorageProvider(
        configService as unknown as ConfigService,
      );

      expect(cdnProvider.getUrl('avatars/photo.png')).toBe(
        'https://cdn.pawtato.app/avatars/photo.png',
      );
    });
  });

  describe('delete', () => {
    it('sends a DeleteObjectCommand for the given key', async () => {
      sendMock.mockResolvedValue({});

      await provider.delete('avatars/photo.png');

      const sentInput = sendMock.mock.calls[0][0].input;

      expect(sentInput).toMatchObject({
        Bucket: 'pawtato-media',
        Key: 'avatars/photo.png',
      });
    });
  });

  describe('uploadPrivate', () => {
    it('uploads the same way as upload() — S3 has no separate private root', async () => {
      sendMock.mockResolvedValue({});

      const key = await provider.uploadPrivate({
        buffer: Buffer.from('data'),
        folder: 'identity-verification',
        originalName: 'nid-front.png',
        mimetype: 'image/png',
        filename: 'nid-front.png',
      });

      expect(key).toBe('identity-verification/nid-front.png');
    });
  });

  describe('getSignedUrl', () => {
    it('returns a presigned GetObject URL', async () => {
      presignMock.mockResolvedValue('https://presigned.example/x');

      const url = await provider.getSignedUrl(
        'identity-verification/x.png',
        300,
      );

      expect(url).toBe('https://presigned.example/x');
      expect(presignMock).toHaveBeenCalled();
    });
  });

  describe('deletePrivate', () => {
    it('sends a DeleteObjectCommand for the given key', async () => {
      sendMock.mockResolvedValue({});

      await provider.deletePrivate('identity-verification/x.png');

      const sentInput = sendMock.mock.calls[0][0].input;

      expect(sentInput).toMatchObject({
        Bucket: 'pawtato-media',
        Key: 'identity-verification/x.png',
      });
    });
  });
});
