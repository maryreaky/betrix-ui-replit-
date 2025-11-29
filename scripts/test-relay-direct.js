/**
 * Direct test of relay invocation
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.SPORTSMONKS_RELAY_URL = 'http://127.0.0.1:3001';

import fetch from 'node-fetch';

async function testRelayDirect() {
  try {
    console.log('🔍 Testing relay direct connection...');
    console.log(`Relay URL: ${process.env.SPORTSMONKS_RELAY_URL}`);

    const relayUrl = `${process.env.SPORTSMONKS_RELAY_URL.replace(/\/$/, '')}/v3/football/livescores?api_token=test`;
    console.log(`Fetching: ${relayUrl}`);

    const r = await fetch(relayUrl, { timeout: 5000 });
    console.log(`Response status: ${r.status} ${r.statusText}`);
    console.log(`Response ok: ${r.ok}`);

    if (r.ok) {
      const j = await r.json().catch(() => null);
      console.log(`JSON parsed:`, j ? 'yes' : 'no');
      if (j && j.data) {
        console.log(`Data array length: ${j.data.length}`);
        if (j.data.length > 0) {
          console.log(`First item name: ${j.data[0].name}`);
          console.log(`✅ Relay returning data!`);
        }
      }
    } else {
      const text = await r.text().catch(() => null);
      console.log(`Response body (first 500 chars): ${text ? text.substring(0, 500) : '(empty)'}`);
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
}

testRelayDirect();
