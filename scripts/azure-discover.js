#!/usr/bin/env node
/**
 * Azure AI Endpoint Discovery Script
 * Attempt to discover the correct endpoint and model format
 */
import fetch from 'node-fetch';

const baseUrl = process.env.AZURE_AI_ENDPOINT || 'https://ai-sefusignal659506ai592573928608.services.ai.azure.com';
const apiKey = process.env.AZURE_AI_KEY;

if (!apiKey) {
  console.error('Error: AZURE_AI_KEY environment variable not set');
  console.error('Usage: AZURE_AI_KEY=<key> node scripts/azure-discover.js');
  process.exit(1);
}

// Try different endpoint patterns
const paths = [
  '/models',
  '/chat/completions',
  '/completions',
  '/v1/chat/completions',
  '/openai/deployments',
  '/api/chat',
  '/api/models',
  '/',
];

async function test(path) {
  try {
    const url = `${baseUrl}${path}`;
    console.log(`[Testing] ${url}`);
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10,
      }),
      timeout: 5000,
    });

    const text = await res.text().catch(() => '');
    if (res.ok) {
      console.log(`[✓ OK] ${path} - ${text.slice(0, 100)}`);
      return { path, ok: true, text };
    } else {
      console.log(`[✗ ${res.status}] ${path} - ${text.slice(0, 100)}`);
      return { path, ok: false, status: res.status, text };
    }
  } catch (err) {
    console.log(`[✗ FAIL] ${path} - ${err.message}`);
    return { path, ok: false, error: err.message };
  }
}

(async () => {
  console.log('Azure AI Endpoint Discovery\n');
  const results = [];
  for (const p of paths) {
    const r = await test(p);
    results.push(r);
    await new Promise(resolve => setTimeout(resolve, 500)); // stagger requests
  }
  const ok = results.filter(r => r.ok);
  console.log(`\nFound ${ok.length} responsive endpoints:`, ok.map(r => r.path));
})();
