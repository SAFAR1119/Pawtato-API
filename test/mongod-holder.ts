import type { MongoMemoryServer } from 'mongodb-memory-server';

// globalSetup and globalTeardown run as two separate calls into the same
// Jest CLI process (not a worker), so this module-scoped singleton survives
// between them — it's how globalTeardown gets a handle on the exact
// in-memory mongod instance globalSetup started, to shut it down cleanly.
let instance: MongoMemoryServer | undefined;

export function setMongod(server: MongoMemoryServer): void {
  instance = server;
}

export function getMongod(): MongoMemoryServer | undefined {
  return instance;
}
