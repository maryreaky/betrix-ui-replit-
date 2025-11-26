import { getRedis } from '../lib/redis-factory.js';
import { Database } from './database.js';
import { PayPalService } from './paypal.js';

const redis = getRedis();

export class PaymentProcessor {
  static async processPaymentJobs() {
    console.log('💳 Payment Processor started');
    
    while (true) {
      try {
        const jobRaw = await redis.lpop('payment-jobs');
        if (!jobRaw) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        const job = JSON.parse(jobRaw);
        
        if (job.type === 'paypal_success') {
          await this.handlePayPalSuccess(job);
        } else if (job.type === 'paypal_webhook') {
          await this.handlePayPalWebhook(job);
        }
      } catch (error) {
        console.error('Payment processing error:', error);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  static async handlePayPalSuccess(job) {
    const { orderId, pendingData } = job;
    const { userId, sport, tier } = pendingData;
    
    try {
      const captureResult = await PayPalService.captureOrder(orderId);
      
      if (captureResult.success && captureResult.data.status === 'COMPLETED') {
        const subscription = {
          tier: tier || 'starter',
          sport: sport || 'football',
          status: 'active',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          paypalOrderId: orderId
        };
        
        await Database.saveSubscription(userId, subscription);
        await Database.savePayment(userId, {
          orderId,
          status: 'completed',
          amount: captureResult.data.purchase_units[0].amount.value,
          currency: captureResult.data.purchase_units[0].amount.currency_code,
          sport,
          tier
        });
        
        await redis.zadd('subscriptions:active', Date.now(), userId);
        await redis.del(`payment:pending:${orderId}`);
        
        console.log(`✅ Subscription activated for user ${userId}: ${sport} ${tier}`);
      } else {
        console.error('Payment capture failed or incomplete:', captureResult);
        await Database.savePayment(userId, {
          orderId,
          status: 'failed',
          error: 'Capture failed or not completed'
        });
      }
    } catch (error) {
      console.error('PayPal capture error:', error);
      await Database.savePayment(userId, {
        orderId,
        status: 'failed',
        error: error.message
      });
    }
  }

  static async handlePayPalWebhook(job) {
    const { event, resource } = job;
    
    console.log(`PayPal webhook received: ${event}`);
    
    if (event === 'PAYMENT.CAPTURE.COMPLETED') {
      console.log('Payment capture completed via webhook');
    } else if (event === 'PAYMENT.CAPTURE.DENIED') {
      console.log('Payment capture denied');
    }
  }
}
