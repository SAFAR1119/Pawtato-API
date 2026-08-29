import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { AppModule } from './app.module';

// Every other *.spec.ts in this codebase mocks its module's dependencies directly,
// so it never exercises real NestJS module wiring (imports/exports) and can't catch
// a provider that's injected but never registered anywhere reachable. This test
// compiles the real, unmocked AppModule end-to-end against a fake Mongoose
// connection (no network/DB needed) specifically to catch that class of bug.
describe('AppModule dependency graph', () => {
  it('resolves every provider without a real database connection', async () => {
    await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getConnectionToken())
      .useValue({
        models: {},
        model: (name: string) => ({ modelName: name }),
      })
      .compile();
  });
});
