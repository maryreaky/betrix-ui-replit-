import 'dotenv/config';
import { Telegraf, Scenes, session, Markup } from 'telegraf';
import express from 'express';
import bodyParser from 'body-parser';
import { Pool } from 'pg';
import { upsertUser, createPayment, getUserById, getRecentPayments, getPaymentByProviderCheckout, getPaymentByTxRef, updatePaymentStatus } from './db.js';
import { initiateStkPush, handleMpesaCallback } from './payments.js';
import football, { setAggregator } from './football.js';
import { getRedis } from '../../src/lib/redis-factory.js';
import { SportsAggregator } from '../../src/services/sports-aggregator.js';

// Initialize a SportsAggregator instance (shared Redis)
const redisClient = getRedis();
const sportsAgg = new SportsAggregator(redisClient);
setAggregator(sportsAgg);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN in environment');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// --- Admin /health command guard ---
const ADMIN_USER_ID = process.env.ADMIN_TELEGRAM_ID ? String(process.env.ADMIN_TELEGRAM_ID) : null;

// Simple session middleware (keeps minimal signup state)
bot.use(session());

function mainKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⚽ Football', 'sport:football')],
    [Markup.button.callback('🔐 Sign up / Profile', 'signup:start')],
    [Markup.button.callback('💳 Pay 300 KES', 'pay:start')]
  ]);
}

function payKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('M-Pesa (Lipana)', 'pay:method:lipana'), Markup.button.callback('M-Pesa (Daraja)', 'pay:method:mpesa')]
  ]);
}

async function pollPaymentStatusAndNotify(ctx, tx_ref, timeoutSeconds = 180) {
  const interval = 3000; // 3s
  const maxAttempts = Math.ceil(timeoutSeconds * 1000 / interval);
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const p = await getPaymentByTxRef(tx_ref);
      const status = p?.status;
      if (status && (status === 'success' || status === 'failed')) {
        if (status === 'success') {
          await ctx.reply('Payment confirmed — thank you! Your account is now active.');
          try { await upsertUser({ user_id: ctx.from.id, status: 'active' }); } catch (e) { /* ignore */ }
        } else {
          await ctx.reply('Payment failed or was cancelled. Please try again.');
        }
        return p;
      }
    } catch (err) {
      console.error('Error polling payment status', err);
    }
    await new Promise(r => setTimeout(r, interval));
  }
  await ctx.reply('No confirmation received yet. We will notify you when the payment completes.');
  return null;
}

bot.action('pay:start', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Choose payment method:', payKeyboard());
});

bot.action('pay:method:lipana', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.paymentMethod = 'lipana';
  await ctx.reply('You chose Lipana M-Pesa. We will use M-Pesa STK to collect 300 KES.');
  // trigger payment flow
  const fakeCtx = ctx; // reuse same ctx
  await (async function trigger() {
    const userId = ctx.from.id;
    let msisdn = ctx.session?.msisdn || null;
    if (!msisdn) {
      try { const u = await getUserById(userId); if (u && u.msisdn) msisdn = u.msisdn; } catch (e) { /* ignore */ }
    }
    if (!msisdn) {
      await ctx.reply('Please send your phone number first (e.g. 2547XXXXXXXX)');
      ctx.session.payAfterNumber = true;
      return;
    }
    await ctx.reply('Initiating STK push — please complete the prompt on your phone. I will wait for confirmation...');
    try {
      const { tx_ref } = await initiateStkPush({ user_id: userId, msisdn, amount: 300 });
      ctx.session.lastPayment = { tx_ref, amount: 300 };
      await ctx.reply(`STK Push initiated. Reference: ${tx_ref}. Please complete the prompt on your phone.`, Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel payment', 'pay:cancel')],
        [Markup.button.callback('🔁 Retry payment', 'pay:retry')]
      ]));
      await pollPaymentStatusAndNotify(ctx, tx_ref, 180);
    } catch (err) {
      console.error('STK push error', err);
      await ctx.reply('Failed to initiate payment. Please try again later.');
    }
  })();
});

bot.action('pay:method:mpesa', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.paymentMethod = 'mpesa';
  await ctx.reply('You chose Daraja M-Pesa. We will use M-Pesa STK to collect 300 KES.');
  // same trigger logic as lipana
  const userId = ctx.from.id;
  let msisdn = ctx.session?.msisdn || null;
  if (!msisdn) {
    try { const u = await getUserById(userId); if (u && u.msisdn) msisdn = u.msisdn; } catch (e) { /* ignore */ }
  }
  if (!msisdn) {
    await ctx.reply('Please send your phone number first (e.g. 2547XXXXXXXX)');
    ctx.session.payAfterNumber = true;
    return;
  }
  await ctx.reply('Initiating STK push — please complete the prompt on your phone. I will wait for confirmation...');
  try {
    const { tx_ref } = await initiateStkPush({ user_id: userId, msisdn, amount: 300 });
    ctx.session.lastPayment = { tx_ref, amount: 300 };
    await ctx.reply(`STK Push initiated. Reference: ${tx_ref}. Please complete the prompt on your phone.`, Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel payment', 'pay:cancel')],
      [Markup.button.callback('🔁 Retry payment', 'pay:retry')]
    ]));
    await pollPaymentStatusAndNotify(ctx, tx_ref, 180);
  } catch (err) {
    console.error('STK push error', err);
    await ctx.reply('Failed to initiate payment. Please try again later.');
  }
});
  }
  const lines = [ `⚽ BETRIX • Upcoming Fixtures (showing ${items.length} of ${total})` ];
  const kb = [];
  for (const m of items) {
    lines.push('• ' + football.formatMatchShort(m));
    const id = m.id ?? m.match_id ?? m.fixture?.id ?? m.home?.id + ':' + m.away?.id;
    kb.push([Markup.button.callback('Details', `match:${id}:football`)]);
  }
  kb.push([Markup.button.callback('🔙 Back', 'sport:football')]);
  await ctx.editMessageText(lines.join('\n'), { reply_markup: Markup.inlineKeyboard(kb).reply_markup });
});

// Match details handler (best-effort id lookup)
bot.action(/match:(.+):football/, async (ctx) => {
  await ctx.answerCbQuery();
  const matchId = ctx.match[1];
  const all = await football.loadMatches();
  const found = all.find(m => String(m.id) === String(matchId) || String(m.match_id) === String(matchId) || String(m.fixture?.id) === String(matchId) || (`${m.home?.id || ''}:${m.away?.id || ''}`) === String(matchId));
  if (!found) {
    await ctx.editMessageText(`Match not found. Showing list instead.`, { reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'sport:football')]]).reply_markup });
    return;
  }
  const detail = football.formatMatchDetail(found);
  await ctx.editMessageText(detail, { reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'sport:football')]]).reply_markup });
});

bot.on('text', async (ctx, next) => {
  const s = ctx.session.signup;
  if (!s) return next();

  const text = ctx.message.text.trim();
  if (s.step === 1) {
    s.full_name = text;
    s.step = 2;
    await ctx.reply('Thanks. What is your phone number (e.g. 2547XXXXXXXX)?');
    return;
  }
  if (s.step === 2) {
    s.msisdn = text;
    s.step = 3;
    await ctx.reply('Optional: What country are you in? (or send "skip")');
    return;
  }
  if (s.step === 3) {
    s.country = text.toLowerCase() === 'skip' ? null : text;
    // persist user
    const user = {
      user_id: ctx.from.id,
      full_name: s.full_name,
      msisdn: s.msisdn,
      country: s.country,
      status: 'trial'
    };
    try {
      await upsertUser(user);
      await ctx.reply('Profile saved! You can now pay to unlock full access.', payKeyboard());
    } catch (err) {
      console.error('Error saving user', err);
      await ctx.reply('Sorry, something went wrong saving your profile. Try again later.');
    }
    ctx.session.signup = null;
    return;
  }
  return next();
});

// Payment action - initiate STK push
bot.action('pay:stk', async (ctx) => {
  await ctx.answerCbQuery();
  // load user data (in real app, query DB)
  const userId = ctx.from.id;
  // For the minimal scaffold, read msisdn from session or prompt
  const msisdn = ctx.session?.msisdn || null;
  // Try DB if not in session
  if (!msisdn) {
    try {
      const u = await getUserById(userId);
      if (u && u.msisdn) ctx.session.msisdn = u.msisdn;
    } catch (err) {
      console.error('Error reading user for msisdn fallback', err);
    }
  }
  if (!ctx.session?.msisdn) {
    await ctx.reply('Please send your phone number first (e.g. 2547XXXXXXXX)');
    ctx.session.payAfterNumber = true;
    return;
  }

  try {
    const { tx_ref } = await initiateStkPush({ user_id: userId, msisdn, amount: 300 });
    ctx.session.lastPayment = { tx_ref, amount: 300 };
    await ctx.reply(`STK Push initiated. Reference: ${tx_ref}. Complete the prompt on your phone.`, Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel payment', 'pay:cancel')],
      [Markup.button.callback('🔁 Retry payment', 'pay:retry')]
    ]));
  } catch (err) {
    console.error('STK push error', err);
    await ctx.reply('Failed to initiate payment. Please try again later.');
  }
});

// If user previously indicated they will pay after giving number
bot.hears(/^[0-9]{9,12}$/, async (ctx) => {
  const possible = ctx.message.text.trim();
  if (ctx.session?.payAfterNumber) {
    ctx.session.payAfterNumber = false;
    ctx.session.msisdn = possible;
    // auto-trigger payment according to chosen method (default lipana)
    await ctx.reply('Thanks — initiating payment...');
    try {
      const { tx_ref } = await initiateStkPush({ user_id: ctx.from.id, msisdn: possible, amount: 300 });
      ctx.session.lastPayment = { tx_ref, amount: 300 };
      await ctx.reply(`STK Push initiated. Reference: ${tx_ref}. Check your phone.`, Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel payment', 'pay:cancel')],
        [Markup.button.callback('🔁 Retry payment', 'pay:retry')]
      ]));
      // poll and notify
      await pollPaymentStatusAndNotify(ctx, tx_ref, 180);
    } catch (err) {
      console.error(err);
      await ctx.reply('Could not start payment. Please try again later.');
    }
    return;
  }
});

// Allow users to cancel or retry while waiting for STK
bot.action('pay:cancel', async (ctx) => {
  await ctx.answerCbQuery();
  const last = ctx.session?.lastPayment;
  if (!last || !last.tx_ref) {
    await ctx.reply('No pending payment found to cancel.');
    return;
  }
  try {
    await updatePaymentStatus(last.tx_ref, 'failed', null, { cancelled_by: ctx.from.id });
    ctx.session.lastPayment = null;
    await ctx.reply('Payment cancelled. If you were charged, contact support.');
  } catch (err) {
    console.error('Failed to cancel payment', err);
    await ctx.reply('Could not cancel the payment. Please try again or contact support.');
  }
});

bot.action('pay:retry', async (ctx) => {
  await ctx.answerCbQuery();
  const last = ctx.session?.lastPayment;
  if (!last || !last.tx_ref) {
    await ctx.reply('No recent payment to retry.');
    return;
  }
  let msisdn = ctx.session?.msisdn || null;
  if (!msisdn) {
    try { const u = await getUserById(ctx.from.id); if (u && u.msisdn) msisdn = u.msisdn; } catch (e) { /* ignore */ }
  }
  if (!msisdn) {
    await ctx.reply('No phone number found. Please send your phone number (e.g. 2547XXXXXXXX) to retry.');
    ctx.session.payAfterNumber = true;
    return;
  }
  try {
    const { tx_ref } = await initiateStkPush({ user_id: ctx.from.id, msisdn, amount: last.amount || 300 });
    ctx.session.lastPayment = { tx_ref, amount: last.amount || 300 };
    await ctx.reply(`Retry initiated. Reference: ${tx_ref}. Please complete the prompt on your phone.`, Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel payment', 'pay:cancel')],
      [Markup.button.callback('🔁 Retry payment', 'pay:retry')]
    ]));
    await pollPaymentStatusAndNotify(ctx, tx_ref, 180);
  } catch (err) {
    console.error('Retry STK error', err);
    await ctx.reply('Retry failed. Please try again later.');
  }
});

// Simple middleware to enforce active status for commands (example)
bot.use(async (ctx, next) => {
  // allow /start and admin health
  if (ctx.updateType === 'message' && ctx.message && ctx.message.text) {
    const t = ctx.message.text.trim();
    if (t.startsWith('/start')) return next();
    if (t.startsWith('/health')) return next();
  }

  // For callback queries and other commands, check DB for user status
  const userId = ctx.from && ctx.from.id;
  if (!userId) return next();
  try {
    const user = await getUserById(userId);
    if (user && user.status && user.status !== 'active') {
      // If user is not active, prompt payment flow
      await ctx.reply('Your account is not active. Please pay 300 KES to unlock full access.', payKeyboard());
      return; // short-circuit
    }
  } catch (err) {
    console.error('Error checking user status', err);
  }
  return next();
});

// Admin health command (restricted by ADMIN_TELEGRAM_ID env var)
bot.command('health', async (ctx) => {
  if (!ADMIN_USER_ID || String(ctx.from.id) !== ADMIN_USER_ID) {
    await ctx.reply('Unauthorized');
    return;
  }
  // Check Redis and SportsAggregator health
  try {
    const r = await redisClient.ping();
    const live = await sportsAgg.getAllLiveMatches();
    const fixtures = await sportsAgg.getFixtures();
    await ctx.reply(`Health OK\nRedis: ${r}\nLive matches: ${live?.length || 0}\nFixtures cached: ${fixtures?.length || 0}`);
  } catch (err) {
    await ctx.reply('Health check failed: ' + String(err.message || err));
  }
});

// Admin command to list recent payments
bot.command('payments', async (ctx) => {
  if (!ADMIN_USER_ID || String(ctx.from.id) !== ADMIN_USER_ID) {
    await ctx.reply('Unauthorized');
    return;
  }
  try {
    const items = await getRecentPayments(12);
    if (!items || items.length === 0) {
      await ctx.reply('No payments found.');
      return;
    }
    const lines = items.map(p => {
      const when = p.created_at ? new Date(p.created_at).toISOString().replace('T', ' ').replace('Z','') : '';
      const phone = p.phone_number || (p.metadata && p.metadata.msisdn) || '';
      return `• ${p.tx_ref || p.id} — ${p.status} — ${p.amount} ${p.currency || ''} — ${phone} — ${when}`;
    });
    // Send in chunks if too long
    const chunkSize = 10;
    for (let i = 0; i < lines.length; i += chunkSize) {
      await ctx.reply('\n' + lines.slice(i, i + chunkSize).join('\n'));
    }
  } catch (err) {
    console.error('Failed to list payments', err);
    await ctx.reply('Failed to fetch payments: ' + String(err.message || err));
  }
});

// --- Small express server to receive provider webhooks (M-Pesa callback) ---
const app = express();
app.use(bodyParser.json());

app.post('/webhook/mpesa', async (req, res) => {
  const payload = req.body || {};
  // Handle Safaricom Daraja STK push callback structure if present
  try {
    const stk = payload?.Body?.stkCallback || payload?.stkCallback || null;
    if (stk && stk?.CheckoutRequestID) {
      const checkout = stk.CheckoutRequestID;
      const resultCode = stk.ResultCode;
      const resultDesc = stk.ResultDesc || stk.ResultDescription || null;
      // find payment by provider checkout id
      const payment = await getPaymentByProviderCheckout(checkout);
      if (!payment) {
        console.warn('Webhook: could not find payment for checkout', checkout);
        return res.json({ ok: true, note: 'no payment found' });
      }
      const status = (resultCode === 0 || resultCode === '0') ? 'success' : 'failed';
      const provider_tx_id = stk?.CallbackMetadata?.Item?.find?.(i => i.Name === 'MpesaReceiptNumber')?.Value || null;
      const metadata = { daraja: stk, raw: payload };
      const updated = await handleMpesaCallback({ tx_ref: payment.tx_ref, status, provider_tx_id, metadata });
      if (updated && updated.status === 'success' && updated.user_id) {
        try {
          await bot.telegram.sendMessage(updated.user_id, `Payment received. Thank you — your account is now active.`);
          await upsertUser({ user_id: updated.user_id, status: 'active' });
        } catch (err) {
          console.error('Failed to notify user after payment', err);
        }
      }
      return res.json({ ok: true, updated });
    }

    // Generic fallback expecting tx_ref
    const tx_ref = payload.tx_ref || payload.reference || payload.checkoutRequestID || null;
    const status = payload.status || payload.result || null;
    const provider_tx_id = payload.provider_tx_id || payload.transaction_id || null;
    const metadata = payload.metadata || payload;
    if (!tx_ref) return res.status(400).json({ error: 'missing tx_ref' });
    const updated = await handleMpesaCallback({ tx_ref, status, provider_tx_id, metadata });
    if (updated && updated.status === 'success' && updated.user_id) {
      try {
        await bot.telegram.sendMessage(updated.user_id, `Payment received. Thank you — your account is now active.`);
        await upsertUser({ user_id: updated.user_id, status: 'active' });
      } catch (err) {
        console.error('Failed to notify user after payment', err);
      }
    }
    return res.json({ ok: true, updated });
  } catch (err) {
    console.error('Webhook handling error', err);
    return res.status(500).json({ error: 'internal' });
  }
});

// Bot's internal webhook handler runs on 3001 by default to avoid colliding
// with the standalone `server.cjs` webhook process which commonly uses port 3000.
const webhookPort = process.env.WEBHOOK_PORT ? Number(process.env.WEBHOOK_PORT) : (process.env.PORT ? Number(process.env.PORT) : 3001);
app.listen(webhookPort, () => console.log(`Webhook server listening on port ${webhookPort}`));

bot.launch();

console.log('Bot started.');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
