// src/adapters/payment-mock.js
module.exports = {
  createPayment(reference, amount, userMeta){
    void userMeta; // return instructions and a mock payment id
    return { paymentRef: reference, instructions: `Send KES ${amount} to Till 12345, Reference ${reference}`, gatewayRef: `p_${Date.now()}` };
  },
  async verifyPayment(reference){
    void reference; // in mock we return unpaid; ops can mark as paid by toggling an env or via DB in future
    return { paid: false, gatewayRef: null };
  }
};
