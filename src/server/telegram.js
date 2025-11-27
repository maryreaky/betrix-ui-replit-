const express = require("express");
const router = express.Router();

// Resolve a Telegram chat id from many possible update shapes
function resolveTelegramChatId(update){
  if (!update || typeof update !== 'object') return undefined;
  if (update.message && update.message.chat && update.message.chat.id) return update.message.chat.id;
  if (update.edited_message && update.edited_message.chat && update.edited_message.chat.id) return update.edited_message.chat.id;
  if (update.callback_query && update.callback_query.message && update.callback_query.message.chat && update.callback_query.message.chat.id) return update.callback_query.message.chat.id;
  if (update.channel_post && update.channel_post.chat && update.channel_post.chat.id) return update.channel_post.chat.id;
  if (update.edited_channel_post && update.edited_channel_post.chat && update.edited_channel_post.chat.id) return update.edited_channel_post.chat.id;

  try {
    const stack = [update];
    while (stack.length){
      const obj = stack.pop();
      if (!obj || typeof obj !== 'object') continue;
      if (obj.chat && obj.chat.id && (typeof obj.chat.id === 'number' || /^\d+$/.test(String(obj.chat.id)))) return obj.chat.id;
      for (const k of Object.keys(obj)) {
        if (obj[k] && typeof obj[k] === 'object') stack.push(obj[k]);
      }
    }
  } catch(e){ }

  return undefined;
}

function logTelegramResolvedInfo(prefix, update){
  try {
    const chatId = resolveTelegramChatId(update);
    console.log(`${prefix} TELEGRAM_RAW_UPDATE ${JSON.stringify(update)}`);
    console.log(`${prefix} TELEGRAM_RESOLVED_CHAT_ID ${typeof chatId === 'undefined' ? 'undefined' : chatId}`);
    return chatId;
  } catch(e) {
    console.log(`${prefix} TELEGRAM_RESOLVE_ERROR ${e && e.stack ? e.stack : String(e)}`);
    return undefined;
  }
}

// Minimal POST /telegram route — expects X-Telegram-Bot-Api-Secret-Token header
router.post('/telegram', express.json(), (req, res) => {
  try{
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const header = req.get('X-Telegram-Bot-Api-Secret-Token');
    if (secret && header !== secret) {
      console.log('WEBHOOK_SECRET_MISMATCH', { header, expected: !!secret });
      return res.status(401).send('Unauthorized');
    }

    let chatId;
    if (typeof logTelegramResolvedInfo === 'function') {
      chatId = logTelegramResolvedInfo('INCOMING', req.body);
    } else if (req.body && req.body.message && req.body.message.chat) {
      chatId = req.body.message.chat.id;
      console.log('INCOMING TELEGRAM_RAW_UPDATE', JSON.stringify(req.body));
      console.log('INCOMING TELEGRAM_RESOLVED_CHAT_ID', chatId);
    } else {
      console.log('INCOMING TELEGRAM_RAW_UPDATE', JSON.stringify(req.body));
    }

    console.log('WEBHOOK_ACCEPTED', { chatId: chatId || null, hasBody: !!req.body });
    res.status(200).send('ok');
  }catch(e){
    console.log('WEBHOOK_HANDLER_ERROR', e && e.stack ? e.stack : String(e));
    res.status(500).send('error');
  }
});

module.exports = router;



