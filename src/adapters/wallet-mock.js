// src/adapters/wallet-mock.js
module.exports = {
  async reserve(userId, amount, idempotencyKey){
    // mark params as used for linting
    void userId; void amount; void idempotencyKey;
    // reserve simulation: returns reserveId
    return { reserveId: `r_${Date.now()}_${Math.floor(Math.random()*1000)}`, status: 'reserved' };
  },
  async release(reserveId){
    void reserveId;
    return { status: 'released' };
  },
  async confirm(reserveId){
    void reserveId;
    return { txId: `tx_${Date.now()}_${Math.floor(Math.random()*1000)}`, status: 'confirmed' };
  },
  async balance(userId){
    void userId;
    return { available: 1000000, reserved: 0 };
  }
};
