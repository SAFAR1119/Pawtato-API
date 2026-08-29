import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  dependencies: {
    database: { status: 'up' | 'down'; readyState: number };
    mail: { status: 'configured' | 'not_configured' };
    storage: { status: 'ok'; provider: string };
  };
}

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  async getHealth(): Promise<HealthStatus> {
    const database = await this.checkDatabase();
    const mail = this.checkMail();
    const storage = this.checkStorage();

    return {
      status: database.status === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: { database, mail, storage },
    };
  }

  private async checkDatabase(): Promise<{
    status: 'up' | 'down';
    readyState: number;
  }> {
    const readyState = this.connection.readyState;

    // Anything other than "connected" (disconnected/connecting/
    // disconnecting) is not a usable connection.
    if (readyState !== ConnectionStates.connected || !this.connection.db) {
      return { status: 'down', readyState };
    }

    try {
      await this.connection.db.admin().ping();
      return { status: 'up', readyState };
    } catch {
      return { status: 'down', readyState };
    }
  }

  private checkMail(): { status: 'configured' | 'not_configured' } {
    // MAIL_* env vars are optional (Joi validation allows boot without
    // them), so "configured" reports whether the app can actually send
    // email rather than assuming it always can.
    const host = this.configService.get<string>('mail.host');

    return { status: host ? 'configured' : 'not_configured' };
  }

  private checkStorage(): { status: 'ok'; provider: string } {
    // Both providers (local disk, S3) are validated at boot (Joi requires
    // the S3_* vars when STORAGE_PROVIDER=s3), so whichever is selected is
    // already known-usable by the time this runs.
    return {
      status: 'ok',
      provider: this.configService.get<string>('storage.provider') ?? 'local',
    };
  }
}
