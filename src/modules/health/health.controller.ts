import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @ApiOperation({
    summary: 'Check API liveness and dependency status',
    description:
      'Reports process liveness plus the real status of key dependencies: ' +
      'MongoDB connectivity (a live ping, not just process-up), whether an ' +
      'email provider is configured, and which storage provider is active. ' +
      'Returns HTTP 503 (instead of 200) when the database is unreachable, ' +
      'so orchestrators (Docker HEALTHCHECK, load balancers) can detect a ' +
      'genuinely broken instance rather than one that merely accepted the ' +
      'TCP connection.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is up and the database is reachable.',
    schema: {
      example: {
        success: true,
        message: 'Request successful',
        data: {
          status: 'ok',
          timestamp: '2026-08-24T12:00:00.000Z',
          uptime: 123.45,
          dependencies: {
            database: { status: 'up', readyState: 1 },
            mail: { status: 'configured' },
            storage: { status: 'ok', provider: 'local' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description:
      'The database is unreachable; the API process is up but degraded.',
  })
  @Get()
  async checkHealth(@Res({ passthrough: true }) res: Response) {
    const health = await this.healthService.getHealth();

    res.status(
      health.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );

    return health;
  }
}
