import { MongoMemoryServer } from 'mongodb-memory-server';
import { setMongod } from './mongod-holder';

// Runs once before every e2e suite in this run. Starts a real, throwaway
// mongod (no Docker/external service needed — works the same in CI as it
// does locally) and points every test file at it by setting process.env
// here: Jest forks each test file's worker after globalSetup resolves, and
// those workers inherit process.env at fork time.
export default async function globalSetup() {
  const mongod = await MongoMemoryServer.create();
  setMongod(mongod);

  process.env.MONGO_URI = mongod.getUri('pawtato-e2e');
  process.env.NODE_ENV ||= 'test';
  process.env.JWT_SECRET ||= 'e2e-test-jwt-secret-not-for-production-use';
  process.env.JWT_EXPIRES ||= '1d';
  process.env.REFRESH_SECRET ||= 'e2e-test-refresh-secret-not-for-prod-use';
  process.env.REFRESH_EXPIRES ||= '7d';
  process.env.STORAGE_PROVIDER ||= 'local';
  process.env.APP_URL ||= 'http://localhost:5000';
  process.env.FRONTEND_URL ||= 'http://localhost:3000';
  process.env.CORS_ORIGINS ||= '';
}
