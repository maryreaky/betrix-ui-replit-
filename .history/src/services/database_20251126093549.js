import { getRedis } from '../lib/redis-factory.js';

const redis = getRedis();

export class Database {
  static async getUser(telegramId) {
    const data = await redis.get(`user:${telegramId}`);
    return data ? JSON.parse(data) : null;
  }

  static async saveUser(telegramId, userData) {
    await redis.set(`user:${telegramId}`, JSON.stringify(userData));
    
    if (userData.referralCode) {
      await redis.set(`referralCode:${userData.referralCode}`, telegramId);
    }
    
    await redis.zadd('users:all', Date.now(), telegramId);
  }

  static async updateUser(telegramId, updates) {
    const user = await this.getUser(telegramId);
    if (!user) return null;
    const updated = { ...user, ...updates };
    await this.saveUser(telegramId, updated);
    return updated;
  }

  static async getUserByReferralCode(code) {
    const userId = await redis.get(`referralCode:${code}`);
    if (!userId) return null;
    return await this.getUser(userId);
  }

  static async getSubscription(telegramId) {
    const data = await redis.get(`subscription:${telegramId}`);
    return data ? JSON.parse(data) : null;
  }

  static async saveSubscription(telegramId, subData) {
    await redis.set(`subscription:${telegramId}`, JSON.stringify(subData));
    if (subData.status === 'active') {
      await redis.zadd('subscriptions:active', Date.now(), telegramId);
    }
  }

  static async getReferrals(telegramId) {
    const data = await redis.get(`referrals:${telegramId}`);
    return data ? JSON.parse(data) : [];
  }

  static async addReferral(referrerId, refereeId) {
    const referrals = await this.getReferrals(referrerId);
    referrals.push({
      refereeId,
      timestamp: Date.now(),
      rewardStatus: 'active'
    });
    await redis.set(`referrals:${referrerId}`, JSON.stringify(referrals));
    
    await redis.zincrby('leaderboard:referrals', 1, referrerId);
    await redis.zincrby('leaderboard:points', 50, referrerId);
    
    const referrer = await this.getUser(referrerId);
    const newPoints = (referrer.rewardPoints || 0) + 50;
    const updated = { ...referrer, rewardPoints: newPoints };
    await redis.set(`user:${referrerId}`, JSON.stringify(updated));
    
    if (updated.referralCode) {
      await redis.set(`referralCode:${updated.referralCode}`, referrerId);
    }
    await redis.zadd('users:all', Date.now(), referrerId);
    
    const referralCount = referrals.length;
    if (referralCount === 5) {
      const subscription = {
        tier: 'Pro',
        sport: 'bonus',
        status: 'active',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        source: 'referral_reward'
      };
      await this.saveSubscription(referrerId, subscription);
    }
  }

  static async getLeaderboard(type = 'referrals') {
    const leaderboardKey = type === 'referrals' ? 'leaderboard:referrals' : 'leaderboard:points';
    const topUserIds = await redis.zrevrange(leaderboardKey, 0, 9, 'WITHSCORES');
    
    const users = [];
    for (let i = 0; i < topUserIds.length; i += 2) {
      const userId = topUserIds[i];
      const score = topUserIds[i + 1];
      const user = await this.getUser(userId);
      
      if (user) {
        users.push({
          name: user.name,
          country: user.country,
          referrals: type === 'referrals' ? parseInt(score) : await this.getReferrals(userId).then(r => r.length),
          rewardPoints: type === 'points' ? parseInt(score) : user.rewardPoints || 0
        });
      }
    }
    
    return users;
  }

  static async savePayment(telegramId, paymentData) {
    const payments = await this.getPayments(telegramId);
    payments.push({
      ...paymentData,
      timestamp: Date.now()
    });
    await redis.set(`payments:${telegramId}`, JSON.stringify(payments));
  }

  static async getPayments(telegramId) {
    const data = await redis.get(`payments:${telegramId}`);
    return data ? JSON.parse(data) : [];
  }

  static generateReferralCode(telegramId) {
    return `BETRIX${telegramId.toString().slice(-6)}`;
  }
}
