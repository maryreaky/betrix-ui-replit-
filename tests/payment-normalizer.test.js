/**
 * payment-normalizer.test.js
 * Unit tests for normalizePaymentMethod helper
 */

import assert from 'assert';
import { normalizePaymentMethod, PAYMENT_PROVIDERS } from '../src/handlers/payment-router.js';

console.log('🧪 Payment Method Normalizer Tests\n');

// Test: Direct provider keys (should pass through)
console.log('📌 Test: Direct provider keys (uppercase)');
assert(normalizePaymentMethod('MPESA') === 'MPESA', 'MPESA should normalize to MPESA');
assert(normalizePaymentMethod('PAYPAL') === 'PAYPAL', 'PAYPAL should normalize to PAYPAL');
assert(normalizePaymentMethod('SAFARICOM_TILL') === 'SAFARICOM_TILL', 'SAFARICOM_TILL should normalize to SAFARICOM_TILL');
assert(normalizePaymentMethod('BINANCE') === 'BINANCE', 'BINANCE should normalize to BINANCE');
assert(normalizePaymentMethod('SWIFT') === 'SWIFT', 'SWIFT should normalize to SWIFT');
assert(normalizePaymentMethod('BITCOIN') === 'BITCOIN', 'BITCOIN should normalize to BITCOIN');
console.log('✅ PASS: All direct provider keys normalize correctly\n');

// Test: Common aliases (lowercase/mixed case)
console.log('📌 Test: Common aliases');
assert(normalizePaymentMethod('mpesa') === 'MPESA', 'mpesa -> MPESA');
assert(normalizePaymentMethod('paypal') === 'PAYPAL', 'paypal -> PAYPAL');
assert(normalizePaymentMethod('binance') === 'BINANCE', 'binance -> BINANCE');
assert(normalizePaymentMethod('swift') === 'SWIFT', 'swift -> SWIFT');
assert(normalizePaymentMethod('bitcoin') === 'BITCOIN', 'bitcoin -> BITCOIN');
console.log('✅ PASS: All common aliases normalize correctly\n');

// Test: Safaricom Till aliases
console.log('📌 Test: Safaricom Till aliases');
assert(normalizePaymentMethod('safaricom') === 'SAFARICOM_TILL', 'safaricom -> SAFARICOM_TILL');
assert(normalizePaymentMethod('safaricom_till') === 'SAFARICOM_TILL', 'safaricom_till -> SAFARICOM_TILL');
assert(normalizePaymentMethod('till') === 'SAFARICOM_TILL', 'till -> SAFARICOM_TILL');
assert(normalizePaymentMethod('TILL') === 'SAFARICOM_TILL', 'TILL -> SAFARICOM_TILL');
console.log('✅ PASS: All Safaricom Till aliases normalize correctly\n');

// Test: M-Pesa aliases
console.log('📌 Test: M-Pesa aliases');
assert(normalizePaymentMethod('mpesa_stk') === 'MPESA', 'mpesa_stk -> MPESA');
assert(normalizePaymentMethod('stk') === 'MPESA', 'stk -> MPESA');
assert(normalizePaymentMethod('MPESA_STK') === 'MPESA', 'MPESA_STK -> MPESA');
console.log('✅ PASS: All M-Pesa aliases normalize correctly\n');

// Test: Binance aliases
console.log('📌 Test: Binance aliases');
assert(normalizePaymentMethod('binance_pay') === 'BINANCE', 'binance_pay -> BINANCE');
assert(normalizePaymentMethod('BINANCE_PAY') === 'BINANCE', 'BINANCE_PAY -> BINANCE');
console.log('✅ PASS: All Binance aliases normalize correctly\n');

// Test: Bank/Swift aliases
console.log('📌 Test: Bank/Swift aliases');
assert(normalizePaymentMethod('bank') === 'SWIFT', 'bank -> SWIFT');
assert(normalizePaymentMethod('bank_transfer') === 'SWIFT', 'bank_transfer -> SWIFT');
assert(normalizePaymentMethod('BANK_TRANSFER') === 'SWIFT', 'BANK_TRANSFER -> SWIFT');
console.log('✅ PASS: All Bank/Swift aliases normalize correctly\n');

// Test: Bitcoin aliases
console.log('📌 Test: Bitcoin aliases');
assert(normalizePaymentMethod('btc') === 'BITCOIN', 'btc -> BITCOIN');
assert(normalizePaymentMethod('BTC') === 'BITCOIN', 'BTC -> BITCOIN');
assert(normalizePaymentMethod('eth') === 'BITCOIN', 'eth -> BITCOIN (maps to BITCOIN)');
console.log('✅ PASS: All Bitcoin aliases normalize correctly\n');

// Test: Whitespace trimming
console.log('📌 Test: Whitespace handling');
assert(normalizePaymentMethod('  mpesa  ') === 'MPESA', 'Whitespace should be trimmed');
assert(normalizePaymentMethod('\tpaypal\n') === 'PAYPAL', 'Tabs/newlines should be trimmed');
console.log('✅ PASS: Whitespace is handled correctly\n');

// Test: Invalid inputs
console.log('📌 Test: Invalid/unknown methods');
assert(normalizePaymentMethod('unknown_method') === null, 'Unknown method should return null');
assert(normalizePaymentMethod('fake_provider') === null, 'Fake provider should return null');
assert(normalizePaymentMethod('') === null, 'Empty string should return null');
assert(normalizePaymentMethod(null) === null, 'null input should return null');
assert(normalizePaymentMethod(undefined) === null, 'undefined input should return null');
console.log('✅ PASS: Invalid inputs return null\n');

// Test: Mixed case combinations
console.log('📌 Test: Mixed case combinations');
assert(normalizePaymentMethod('MpEsA') === 'MPESA', 'Mixed case MpEsA -> MPESA');
assert(normalizePaymentMethod('PayPal') === 'PAYPAL', 'Mixed case PayPal -> PAYPAL');
assert(normalizePaymentMethod('SaFaRiCoM_TiLl') === 'SAFARICOM_TILL', 'Mixed case SaFaRiCoM_TiLl -> SAFARICOM_TILL');
console.log('✅ PASS: All mixed case inputs normalize correctly\n');

// Test: All defined providers can be normalized from lowercase
console.log('📌 Test: All defined providers normalize from lowercase');
<<<<<<< HEAD
for (const key of Object.keys(PAYMENT_PROVIDERS)) {
=======
for (const [key, _] of Object.entries(PAYMENT_PROVIDERS)) {
>>>>>>> upstream/main
  const normalized = normalizePaymentMethod(key.toLowerCase());
  assert(normalized === key, `${key.toLowerCase()} should normalize to ${key}, got ${normalized}`);
}
console.log('✅ PASS: All defined providers normalize from lowercase\n');

console.log('🎉 All payment normalizer tests passed!\n');
