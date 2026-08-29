import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { DatabaseModule } from './database.module';

describe('DatabaseModule', () => {
  async function build(connection: unknown) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseModule,
        { provide: getConnectionToken(), useValue: connection },
      ],
    }).compile();

    return module.get<DatabaseModule>(DatabaseModule);
  }

  it("synchronizes every registered model's indexes on boot", async () => {
    const syncIndexes = jest.fn().mockResolvedValue(undefined);
    const databaseModule = await build({ syncIndexes });

    await databaseModule.onApplicationBootstrap();

    expect(syncIndexes).toHaveBeenCalledTimes(1);
  });

  it('skips gracefully when the injected connection has no syncIndexes (e.g. a test double)', async () => {
    const databaseModule = await build({ models: {} });

    await expect(
      databaseModule.onApplicationBootstrap(),
    ).resolves.not.toThrow();
  });

  it('propagates a sync failure instead of letting boot silently continue with stale indexes', async () => {
    const syncIndexes = jest.fn().mockRejectedValue(new Error('sync failed'));
    const databaseModule = await build({ syncIndexes });

    await expect(databaseModule.onApplicationBootstrap()).rejects.toThrow(
      'sync failed',
    );
  });
});
