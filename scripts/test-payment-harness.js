import fs from 'fs';
import path from 'path';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { createPaymentOrder, verifyAndActivatePayment } from '../src/handlers/payment-router.js';

// Load .env if present
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Also load .env.local if present (common convention)
  const envLocal = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
}

(async () => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error('\nERROR: REDIS_URL not set.');
    console.error('Create a `.env` file in the repo root (copy `.env.example`) and add your Redis connection string as:');
    console.error('  REDIS_URL=redis://default:YOUR_PASSWORD@hostname:port');
    process.exit(2);
  }

  const redis = new Redis(redisUrl);
  try {
    const userId = process.env.TEST_USER_ID || '9999';
    const tier = process.env.TEST_TIER || 'VVIP';
    const paymentMethod = process.env.TEST_METHOD || 'PAYPAL';

    console.log('Creating order for', paymentMethod, '...');
    const order = await createPaymentOrder(redis, userId, tier, paymentMethod, process.env.TEST_REGION || 'US', {});
    console.log('Order created:', order.orderId);

    // Inspect mapping
    const byUser = await redis.get(`payment:by_user:${userId}:pending`);
    console.log('Mapped by_user:', byUser);
    if (order.providerRef) {
      const byRef = await redis.get(`payment:by_provider_ref:${paymentMethod}:${order.providerRef}`);
      console.log('Mapped by_provider_ref:', byRef);
    }

    if (order.metadata && order.metadata.checkoutUrl) {
      console.log('Checkout URL (PayPal):', order.metadata.checkoutUrl);
    }

    // Simulate verification (as if webhook arrived)
    console.log('Simulating verification...');
    const verification = await verifyAndActivatePayment(redis, order.orderId, `TESTTX_${Date.now()}`);
    console.log('Verification result:', verification);

    // Check user subscription
    const sub = await redis.hgetall(`user:${userId}`);
    console.log('User subscription record:', sub);

    console.log('Done.');
  } catch (e) {
    if (e && e.message && e.message.includes('NOAUTH')) {
      console.error('\nRedis rejected the command: NOAUTH Authentication required.');
      console.error('Double-check the `REDIS_URL` in your environment or `.env` file and ensure it includes the password.');
    }
    console.error('Test failed:', e);
  } finally {
    try { redis.disconnect(); } catch (ex) {}
  }
})();
