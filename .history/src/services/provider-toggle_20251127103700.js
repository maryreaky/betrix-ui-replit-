/**
 * Simple runtime provider toggle helpers using Redis
 */
class ProviderToggle {
  constructor(redis) {
    this.redis = redis;
  }

  async setEnabled(providerName, enabled = true) {
    if (!this.redis) throw new Error('Redis required for runtime toggles');
    const key = `betrix:provider:enabled:${String(providerName).toLowerCase()}`;
    await this.redis.set(key, enabled ? 'true' : 'false');
    return true;
  }

  async isEnabled(providerName) {
    if (!this.redis) return null;
    const key = `betrix:provider:enabled:${String(providerName).toLowerCase()}`;
    const v = await this.redis.get(key).catch(() => null);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return null;
  }
}

export default ProviderToggle;
