import { getMongod } from './mongod-holder';

export default async function globalTeardown() {
  const mongod = getMongod();

  if (mongod) {
    await mongod.stop();
  }
}
