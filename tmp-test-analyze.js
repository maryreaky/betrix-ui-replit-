import { handleCommand } from './src/handlers/commands-v3.js';

const mockRedis = {
  hgetall: async () => ({}),
  get: async () => null
};

(async () => {
  const res = await handleCommand('analyze', ['invalid_id'], 123, 456, mockRedis, {});
  console.log('RES:', JSON.stringify(res, null, 2));
})();
