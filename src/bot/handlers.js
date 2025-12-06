import fetch from 'node-fetch';
import { routeTelegramCommand } from './command-router.js';

const BOT = () => `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;

export async function sendMessage(chatId, text, extra = {}) {
  try {
    await fetch(`${BOT()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, ...extra }),
    });
  } catch (e) {
    console.error('[handlers] sendMessage failed', e && (e.message || e));
  }
}

export async function sendMenu(chatId, text, keyboard) {
  return sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
}

export async function handleCallbackQuery(update) {
  const cq = update.callback_query;
  if (!cq) return;
  const chatId = cq.message.chat.id;
  const data = cq.data || '';

  if (data.startsWith('odds:')) {
    const matchId = data.split(':')[1];
    await sendMessage(chatId, `Odds for ${matchId} coming soon.`);
    return;
  }

  if (data === 'fixtures') {
    await sendMessage(chatId, 'Fixtures menu coming soon.');
    return;
  }

  await sendMessage(chatId, "Unknown selection. Try /help.");
}

export async function handleCommand(update) {
  const msg = update.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const cmdObj = routeTelegramCommand(msg);

  switch (cmdObj.action) {
    case 'start':
      return sendMenu(chatId, 'Welcome to BETRIX 🚀\nChoose an option:', [
        [{ text: 'Fixtures', callback_data: 'fixtures' }],
        [{ text: 'Odds', callback_data: 'odds' }],
        [{ text: 'Place Bet', callback_data: 'bet' }],
        [{ text: 'Settings', callback_data: 'settings' }],
        [{ text: 'Help', callback_data: 'help' }],
      ]);

    case 'help':
      return sendMessage(chatId, 'Commands:\n/start \n/help \n/fixtures \n/odds <id> \n/bet <id> <market> <stake>');

    case 'fixtures':
      return sendMessage(chatId, 'Fixtures coming soon.');

    case 'odds':
      return sendMessage(chatId, 'Odds: please provide a match id (e.g. /odds 12345)');

    case 'bet':
      return sendMessage(chatId, 'Bet flow coming soon.');

    case 'pay':
      return sendMessage(chatId, 'Payment flow coming soon.');

    default:
      return sendMessage(chatId, "Unknown command. Type /help.");
  }
}
