import { Global, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import { databaseConfig } from './database.config';

@Global()
@Module({
  imports: [
    ConfigModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  // Mongoose's default autoIndex creates indexes a schema newly declares,
  // but never drops ones a schema stops declaring — so removing/renaming a
  // `unique` field (as happened with Tag.serialNumber) leaves its old unique
  // index live in MongoDB. Since every future document then omits that
  // field, Mongo indexes the "missing" value as null for all of them, and a
  // unique index only allows *one* null — the very next create after the
  // change fails with a raw E11000 that looks nothing like the actual cause.
  // syncIndexes() reconciles every registered model's indexes with its
  // current schema on every boot (creates what's missing, drops what's
  // gone), so this whole class of bug can't silently reoccur.
  async onApplicationBootstrap() {
    // The DI-check test's fake connection has no syncIndexes/models — skip
    // there rather than special-case test setup.
    if (typeof this.connection.syncIndexes !== 'function') {
      return;
    }

    try {
      await this.connection.syncIndexes();
    } catch (error) {
      this.logger.error(
        'Failed to synchronize MongoDB indexes on boot',
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }
}
