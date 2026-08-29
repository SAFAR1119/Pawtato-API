import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let configService: { get: jest.Mock };
  let connection: {
    readyState: number;
    db: { admin: jest.Mock } | undefined;
  };

  const buildModule = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: getConnectionToken(), useValue: connection },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    return module.get<HealthService>(HealthService);
  };

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'mail.host') return 'smtp.example.com';
        if (key === 'storage.provider') return 'local';
        return undefined;
      }),
    };

    connection = {
      readyState: 1,
      db: {
        admin: jest.fn(() => ({ ping: jest.fn().mockResolvedValue(true) })),
      },
    };
  });

  it('should be defined', async () => {
    service = await buildModule();
    expect(service).toBeDefined();
  });

  describe('getHealth', () => {
    it('reports ok when the database ping succeeds', async () => {
      service = await buildModule();

      const result = await service.getHealth();

      expect(result.status).toBe('ok');
      expect(result.dependencies.database).toEqual({
        status: 'up',
        readyState: 1,
      });
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
      expect(typeof result.uptime).toBe('number');
    });

    it('reports degraded when the connection readyState is not connected', async () => {
      connection.readyState = 0;
      service = await buildModule();

      const result = await service.getHealth();

      expect(result.status).toBe('degraded');
      expect(result.dependencies.database).toEqual({
        status: 'down',
        readyState: 0,
      });
    });

    it('reports degraded when the admin ping throws despite readyState 1', async () => {
      connection.db = {
        admin: jest.fn(() => ({
          ping: jest.fn().mockRejectedValue(new Error('ping failed')),
        })),
      };
      service = await buildModule();

      const result = await service.getHealth();

      expect(result.status).toBe('degraded');
      expect(result.dependencies.database.status).toBe('down');
    });

    it('reports mail as not_configured when no mail host is set', async () => {
      configService.get = jest.fn((key: string) => {
        if (key === 'storage.provider') return 'local';
        return undefined;
      });
      service = await buildModule();

      const result = await service.getHealth();

      expect(result.dependencies.mail).toEqual({ status: 'not_configured' });
    });

    it('reports the active storage provider', async () => {
      configService.get = jest.fn((key: string) => {
        if (key === 'mail.host') return 'smtp.example.com';
        if (key === 'storage.provider') return 's3';
        return undefined;
      });
      service = await buildModule();

      const result = await service.getHealth();

      expect(result.dependencies.storage).toEqual({
        status: 'ok',
        provider: 's3',
      });
    });
  });
});
