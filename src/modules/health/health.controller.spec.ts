import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { HealthStatus } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: { getHealth: jest.Mock };
  let res: { status: jest.Mock };

  beforeEach(async () => {
    healthService = { getHealth: jest.fn() };
    res = { status: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('checkHealth', () => {
    const okHealth: HealthStatus = {
      status: 'ok',
      timestamp: '2026-08-24T00:00:00.000Z',
      uptime: 10,
      dependencies: {
        database: { status: 'up', readyState: 1 },
        mail: { status: 'configured' },
        storage: { status: 'ok', provider: 'local' },
      },
    };

    it('responds 200 and returns the health payload when status is ok', async () => {
      healthService.getHealth.mockResolvedValue(okHealth);

      const result = await controller.checkHealth(res as never);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(result).toBe(okHealth);
    });

    it('responds 503 when status is degraded', async () => {
      const degradedHealth: HealthStatus = {
        ...okHealth,
        status: 'degraded',
        dependencies: {
          ...okHealth.dependencies,
          database: { status: 'down', readyState: 0 },
        },
      };
      healthService.getHealth.mockResolvedValue(degradedHealth);

      const result = await controller.checkHealth(res as never);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(result).toBe(degradedHealth);
    });
  });
});
