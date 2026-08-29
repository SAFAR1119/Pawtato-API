/**
 * Phase 8 load test: hits the highest-traffic, no-auth surface —
 * `GET /api/public/tags/:publicCode` — under burst concurrency and reports
 * latency plus how the `public` throttler tier (20 req/min, see
 * app.module.ts) actually behaves once that burst crosses the limit.
 *
 * Self-contained: boots the real app against a throwaway in-memory MongoDB
 * (no external services, no Docker), seeds one assigned tag directly via
 * the Mongoose models, runs autocannon, then tears everything down.
 *
 * Run with: npm run load-test
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import autocannon from 'autocannon';

import { createTestApp } from '../test/test-app';
import { User } from '../src/modules/users/schemas/user.schema';
import { Pet } from '../src/modules/pets/schemas/pet.schema';
import { Tag } from '../src/modules/tags/schemas/tag.schema';
import { TagStatus } from '../src/common/enums/tag-status.enum';

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri('pawtato-load-test');
  process.env.NODE_ENV ||= 'test';
  process.env.JWT_SECRET ||= 'load-test-jwt-secret-not-for-production-use';
  process.env.JWT_EXPIRES ||= '1d';
  process.env.REFRESH_SECRET ||= 'load-test-refresh-secret-not-for-prod-use';
  process.env.REFRESH_EXPIRES ||= '7d';
  process.env.STORAGE_PROVIDER ||= 'local';
  process.env.APP_URL ||= 'http://localhost:5000';
  process.env.FRONTEND_URL ||= 'http://localhost:3000';
  process.env.CORS_ORIGINS ||= '';

  const app = await createTestApp();
  await app.listen(0);
  const server = app.getHttpServer() as import('http').Server;
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  const userModel = app.get<Model<User>>(getModelToken(User.name));
  const petModel = app.get<Model<Pet>>(getModelToken(Pet.name));
  const tagModel = app.get<Model<Tag>>(getModelToken(Tag.name));

  const owner = await userModel.create({
    fullName: 'Load Test Owner',
    email: 'load-test-owner@example.com',
    password: 'not-used-directly-by-this-script',
  });

  const pet = await petModel.create({
    owner: owner._id,
    name: 'Load Test Pet',
    species: 'dog',
  });

  const publicCode = 'load-test-tag-code';

  await tagModel.create({
    publicCode,
    ownerId: owner._id,
    linkUrl: `${process.env.APP_URL}/api/public/tags/${publicCode}`,
    status: TagStatus.ASSIGNED,
    assignedPetId: pet._id,
    assignedAt: new Date(),
  });

  console.log(
    `Seeded one ASSIGNED tag (publicCode=${publicCode}). Running autocannon against ` +
      `http://localhost:${port}/api/public/tags/${publicCode} for 15s at 30 connections ` +
      `(the 'public' throttler tier allows 20 req/min per client) ...\n`,
  );

  const result = await autocannon({
    url: `http://localhost:${port}/api/public/tags/${publicCode}`,
    connections: 30,
    duration: 15,
  });

  const statusCounts: Record<string, number> = {};
  for (const [code, stat] of Object.entries(
    result.statusCodeStats ?? {},
  )) {
    statusCounts[code] = stat?.count ?? 0;
  }

  console.log('--- Results ---');
  console.log(`Total requests: ${result.requests.total}`);
  console.log(`Status code breakdown: ${JSON.stringify(statusCounts)}`);
  console.log(
    `Latency (ms): avg=${result.latency.average} p50=${result.latency.p50} ` +
      `p99=${result.latency.p99} max=${result.latency.max}`,
  );
  console.log(
    `Throughput: ${result.requests.average} req/s average over ${result.duration}s`,
  );

  await app.close();
  await mongod.stop();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
