import lipana from '../lib/lipana-client.js';

/**
 * Reconcile pending payments with Lipana
 * @param {Object} opts - { pool, telegram, redis, thresholdMinutes=5, limit=200, adminId=null }
 */
export async function reconcileWithLipana(opts = {}) {
  const { pool, telegram, redis, thresholdMinutes = 5, limit = 200, adminId = null } = opts;
  if (!pool) throw new Error('Postgres pool required');

  const summary = { checked: 0, updatedSuccess: 0, updatedFailed: 0, errors: 0 };

  try {
    const q = `SELECT id, tx_ref, metadata->>'provider_checkout_id' as provider_checkout_id FROM payments WHERE status = 'pending' AND (metadata->>'provider_checkout_id') IS NOT NULL AND created_at < (now() - ($1 || '5 minutes')::interval) LIMIT $2`;
    const { rows } = await pool.query(q, [`${thresholdMinutes} minutes`, limit]);
    if (!rows || rows.length === 0) return { summary, rows: [] };

    for (const r of rows) {
      summary.checked += 1;
      const providerId = r.provider_checkout_id;
      if (!providerId) continue;
      try {
        const resp = await lipana.getTransaction(providerId);
        const status = resp?.raw?.data?.status || resp?.raw?.status || null;
        if (status && String(status).toLowerCase() === 'success') {
          const upd = `UPDATE payments SET status = 'success', tx_id = $1, updated_at = now() WHERE (metadata->>'provider_checkout_id') = $2 OR tx_ref = $3 RETURNING *`;
          const { rows: updated } = await pool.query(upd, [providerId, providerId, providerId]);
          summary.updatedSuccess += (updated && updated.length) || 0;
          if (telegram && adminId) {
            try { await telegram.sendMessage(adminId, `✅ Reconciled payment ${providerId} -> marked SUCCESS (${updated.length} rows)`); } catch(e) {}
          }
        } else if (status && (String(status).toLowerCase() === 'failed' || String(status).toLowerCase() === 'cancelled')) {
          const upd = `UPDATE payments SET status = 'failed', updated_at = now() WHERE (metadata->>'provider_checkout_id') = $1 OR tx_ref = $2 RETURNING *`;
          const { rows: updated } = await pool.query(upd, [providerId, providerId]);
          summary.updatedFailed += (updated && updated.length) || 0;
          if (telegram && adminId) {
            try { await telegram.sendMessage(adminId, `❌ Reconciled payment ${providerId} -> marked FAILED (${updated.length} rows)`); } catch(e) {}
          }
        } else {
          // not a terminal state
        }
      } catch (e) {
        summary.errors += 1;
      }
    }

    return { summary };
  } catch (err) {
    throw err;
  }
}
