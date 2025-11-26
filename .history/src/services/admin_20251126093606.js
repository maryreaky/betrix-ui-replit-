import { Database } from './database.js';
import { getRedis } from '../lib/redis-factory.js';

export class AdminService {
  static redis = getRedis();
  static ADMIN_IDS = (process.env.ADMIN_TELEGRAM_ID || '').split(',').map(id => parseInt(id.trim())).filter(Boolean);

  static isAdmin(telegramId) {
    return this.ADMIN_IDS.includes(parseInt(telegramId));
  }

  static async getStats() {
    const totalUsers = await this.redis.zcard('users:all');
    const referralLeaderboard = await this.redis.zrevrange('leaderboard:referrals', 0, -1, 'WITHSCORES');
    
    let totalReferrals = 0;
    for (let i = 1; i < referralLeaderboard.length; i += 2) {
      totalReferrals += parseInt(referralLeaderboard[i]);
    }
    
    const totalSubscriptions = await this.redis.zcard('subscriptions:active');

    return {
      totalUsers,
      totalReferrals,
      totalSubscriptions,
      activeUsers: totalUsers,
      timestamp: new Date().toISOString()
    };
  }

  static async broadcastMessage(message) {
    const userIds = await this.redis.zrange('users:all', 0, -1);
    return userIds;
  }
}
