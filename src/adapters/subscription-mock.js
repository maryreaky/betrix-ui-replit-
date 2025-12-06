module.exports = {
  async createSubscription(userId, tier) {
    void userId;
    const id = `sub_${Date.now()}`;
    return { subscriptionId: id, tier, expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() };
  },
  async getSubscription(userId) {
    void userId;
    return null;
  }
};
