export async function safeEdit(ctx, newText, newMarkup) {
  try {
    // Attach a freshness stamp (optional) — using HH:MM:SS to indicate refresh time
    const stamp = new Date().toISOString().slice(11,19); // HH:MM:SS
    const stampedText = `${newText}\n\n_Refreshed ${stamp}_`;

    // Try ctx.editMessageText if available (Telegraf-style)
    if (ctx && typeof ctx.editMessageText === 'function') {
      await ctx.editMessageText(stampedText, {
        parse_mode: 'Markdown',
        reply_markup: newMarkup
      });
      return;
    }

    // If ctx is raw bot instance with chat/message ids
    if (ctx && ctx.chat && ctx.message && typeof ctx.bot !== 'undefined') {
      // try to edit via bot
      await ctx.bot.editMessageText(stampedText, { chat_id: ctx.chat.id, message_id: ctx.message.message_id, parse_mode: 'Markdown', reply_markup: newMarkup });
      return;
    }

    // As a last resort, try to send a new message if we cannot edit
    if (ctx && typeof ctx.reply === 'function') {
      await ctx.reply(newText, { reply_markup: newMarkup });
      return;
    }
  } catch (err) {
    const msg = String(err?.description || err?.message || err || '');
    const isNotModified = msg.includes('message is not modified') || msg.includes('Bad Request: message is not modified');
    if (isNotModified) {
      try { if (ctx && typeof ctx.answerCbQuery === 'function') await ctx.answerCbQuery('Already up to date ✅', { show_alert: false }); } catch (_) {}
      return;
    }

    const isCantEdit = msg.includes('message to edit not found') || msg.includes("message can't be edited") || msg.includes('message to edit has no text');
    if (isCantEdit) {
      try {
        if (ctx && typeof ctx.reply === 'function') {
          await ctx.reply(newText, { reply_markup: newMarkup });
          return;
        }
      } catch (e) {
        // fallthrough
      }
    }

    // Unexpected: rethrow so callers can log
    throw err;
  }
}
