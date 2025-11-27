#!/usr/bin/env node

/**
 * Quick Feature Verification Test - No Redis Required
 * Tests: Branding, Menus, Tier System, Payment Pricing
 */

import { Logger } from './src/utils/logger.js';
import { TIERS } from './src/handlers/payment-handler.js';
import { PAYMENT_PROVIDERS, getTierPrice } from './src/handlers/payment-router.js';
import { mainMenu, subscriptionMenu, welcomeNewUser, welcomeReturningUser, sportsMenu, profileMenu, helpMenu } from './src/handlers/menu-handler.js';

const logger = new Logger('FeatureTest');

let testsPassed = 0;
let testsFailed = 0;

function test(name, condition, errorMsg = '') {
  if (condition) {
    console.log(`✅ ${name}`);
    testsPassed++;
  } else {
    console.error(`❌ ${name} - ${errorMsg}`);
    testsFailed++;
  }
}

console.log('\n🌀 BETRIX BOT - FEATURE VERIFICATION TEST\n');
console.log('='.repeat(70));

// TEST 1: BRANDING
console.log('\n📌 BRANDING & MENUS');
test('Main menu includes BETRIX branding', mainMenu.text.includes('BETRIX'));
test('Main menu has Live Games button', JSON.stringify(mainMenu.reply_markup).includes('Live Games'));
test('Main menu has Odds & Analysis button', JSON.stringify(mainMenu.reply_markup).includes('Odds'));
test('Main menu has Sign Up button', JSON.stringify(mainMenu.reply_markup).includes('Sign Up'));
test('Main menu has Subscribe button', JSON.stringify(mainMenu.reply_markup).includes('VVIP'));
test('Main menu has Profile button', JSON.stringify(mainMenu.reply_markup).includes('Profile'));
test('Main menu has Help button', JSON.stringify(mainMenu.reply_markup).includes('Help'));
test('Sports menu exists', sportsMenu && sportsMenu.text);
test('Profile menu exists', profileMenu && profileMenu.text);
test('Help menu exists', helpMenu && helpMenu.text);

// TEST 2: SIGNUP & PRICING
console.log('\n💰 SIGNUP & PRICING');
test('Signup fee mentioned (KES 150)', subscriptionMenu.text.includes('150'));
test('Signup fee is one-time', subscriptionMenu.text.includes('one-time'));
test('PRO pricing shown', subscriptionMenu.text.includes('899'));
test('VVIP pricing shown', subscriptionMenu.text.includes('2,699'));
test('PLUS pricing shown', subscriptionMenu.text.includes('8,999'));
test('Payment methods shown', subscriptionMenu.text.includes('Safaricom Till'));
test('M-Pesa payment option', subscriptionMenu.text.includes('M-Pesa'));
test('PayPal payment option', subscriptionMenu.text.includes('PayPal'));

// TEST 3: TIER SYSTEM
console.log('\n👤 TIER SYSTEM');
test('SIGNUP tier exists', TIERS['SIGNUP'] !== undefined);
test('FREE tier exists', TIERS['FREE'] !== undefined);
test('PRO tier exists', TIERS['PRO'] !== undefined);
test('VVIP tier exists', TIERS['VVIP'] !== undefined);
test('PLUS tier exists', TIERS['PLUS'] !== undefined);
test('SIGNUP has features', TIERS['SIGNUP'].features && TIERS['SIGNUP'].features.length > 0);
test('VVIP has features', TIERS['VVIP'].features && TIERS['VVIP'].features.length > 0);

// TEST 4: PRICING
console.log('\n💳 PAYMENT PRICING');
const signupKES = getTierPrice('SIGNUP', 'MPESA');
const signupUSD = getTierPrice('SIGNUP', 'PAYPAL');
test('SIGNUP fee is KES 150 for M-Pesa', signupKES === 150, `Got ${signupKES}`);
test('SIGNUP fee is USD 1 for PayPal', signupUSD === 1, `Got ${signupUSD}`);

const proKES = getTierPrice('PRO', 'MPESA');
test('PRO tier has KES pricing', proKES > 0, `Got ${proKES}`);

const vvipKES = getTierPrice('VVIP', 'MPESA');
test('VVIP tier has KES pricing', vvipKES > 0, `Got ${vvipKES}`);

const plusKES = getTierPrice('PLUS', 'MPESA');
test('PLUS tier has KES pricing', plusKES > 0, `Got ${plusKES}`);

// TEST 5: PAYMENT PROVIDERS
console.log('\n💬 PAYMENT PROVIDERS');
test('MPESA provider configured', PAYMENT_PROVIDERS['MPESA'] !== undefined);
test('SAFARICOM_TILL provider configured', PAYMENT_PROVIDERS['SAFARICOM_TILL'] !== undefined);
test('PAYPAL provider configured', PAYMENT_PROVIDERS['PAYPAL'] !== undefined);
test('BINANCE provider configured', PAYMENT_PROVIDERS['BINANCE'] !== undefined);
test('SWIFT provider configured', PAYMENT_PROVIDERS['SWIFT'] !== undefined);
test('MPESA accepts KES', PAYMENT_PROVIDERS['MPESA'].currencies.includes('KES'));
test('SAFARICOM_TILL accepts KES', PAYMENT_PROVIDERS['SAFARICOM_TILL'].currencies.includes('KES'));

// TEST 6: WELCOME MESSAGES
console.log('\n🎉 WELCOME MESSAGES');
test('New user welcome function exists', typeof welcomeNewUser === 'function');
test('Returning user welcome function exists', typeof welcomeReturningUser === 'function');
const newUserWelcome = welcomeNewUser();
test('New user welcome has content', newUserWelcome && newUserWelcome.length > 0);
const returningUserWelcome = welcomeReturningUser({ name: 'John', tier: 'VVIP' });
test('Returning user welcome has content', returningUserWelcome && returningUserWelcome.length > 0);
test('Returning user welcome includes name', returningUserWelcome.includes('John'));
test('Returning user welcome includes tier', returningUserWelcome.includes('VVIP'));

// TEST 7: MENU BUTTONS
console.log('\n🔘 MENU BUTTONS');
const mainMenuButtons = mainMenu.reply_markup.inline_keyboard.flat().map(b => b.text).join(' | ');
test('Menu has all sport categories', mainMenu.reply_markup.inline_keyboard.length > 3);
test('Subscription menu has Free tier', subscriptionMenu.reply_markup.inline_keyboard.flat().some(b => b.text.includes('Free')));
test('Subscription menu has Pro tier', subscriptionMenu.reply_markup.inline_keyboard.flat().some(b => b.text.includes('Pro')));
test('Subscription menu has VVIP tier', subscriptionMenu.reply_markup.inline_keyboard.flat().some(b => b.text.includes('VVIP')));
test('Subscription menu has Plus tier', subscriptionMenu.reply_markup.inline_keyboard.flat().some(b => b.text.includes('Plus')));
test('Subscription menu has payment methods', subscriptionMenu.reply_markup.inline_keyboard.flat().some(b => b.text.includes('Till') || b.text.includes('Pesa')));

// TEST 8: FLOW INTEGRITY
console.log('\n🔄 FLOW INTEGRITY');
test('Main menu callback data valid', mainMenu.reply_markup.inline_keyboard.flat().every(b => b.callback_data && typeof b.callback_data === 'string'));
test('Subscription menu callback data valid', subscriptionMenu.reply_markup.inline_keyboard.flat().every(b => b.callback_data && typeof b.callback_data === 'string'));
test('Sports menu callback data valid', sportsMenu.reply_markup.inline_keyboard.flat().every(b => b.callback_data && typeof b.callback_data === 'string'));

// SUMMARY
console.log('\n' + '='.repeat(70));
console.log('\n📊 TEST SUMMARY');
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`Total:  ${testsPassed + testsFailed}`);
console.log('\n' + '='.repeat(70));

if (testsFailed === 0) {
  console.log('\n🎉 ALL TESTS PASSED - BOT IS READY FOR DEPLOYMENT!\n');
  process.exit(0);
} else {
  console.log(`\n⚠️  ${testsFailed} tests failed - review above before deploying.\n`);
  process.exit(1);
}
