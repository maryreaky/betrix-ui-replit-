import fetch from 'node-fetch';

class ClaudeService {
  constructor(apiKey, model = 'claude-haiku-4.5', timeoutMs = 15000) {
    this.apiKey = apiKey;
    this.model = model;
    this.timeout = Number(timeoutMs) || 15000;
    this.enabled = Boolean(apiKey);
  }

  async chat(message, context = {}) {
    if (!this.enabled) throw new Error('Claude API key not configured');

    const url = 'https://api.anthropic.com/v1/complete';
    const prompt = `\n\nHuman: ${message}\n\nAssistant:`;
    const body = {
      model: this.model,
      prompt,
      max_tokens_to_sample: 1024,
      temperature: 0.2,
      stop_sequences: ['\n\nHuman:'],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Claude API error ${res.status}: ${txt}`);
      }

      const json = await res.json();
      // Anthropic responses may include `completion` or choices; be tolerant
      const out = json.completion || (json?.choices && json.choices[0] && (json.choices[0].text || json.choices[0].content)) || json.output || '';
      return String(out || '');
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  isHealthy() {
    return this.enabled;
  }
}

export default ClaudeService;
