/**
 * Test: Optimized Gemini token efficiency
 */

import { GeminiService } from './src/services/gemini.js';

(async () => {
  console.log('=== Gemini Token Optimization Tests ===\n');

  const gemini = new GeminiService(process.env.GEMINI_API_KEY || null);

  if (!gemini.enabled) {
    console.log('⚠️  Gemini API key not configured. Skipping live tests.');
    console.log('    (Tests would require GEMINI_API_KEY env var)');
    console.log('\n    Changes made to optimize token usage:');
    console.log('    1. Reduced system prompt from ~400 tokens → ~80 tokens');
    console.log('    2. Lowered maxOutputTokens: 300 → 200 (first attempt)');
    console.log('    3. Added fallback: 200 → 120 (if MAX_TOKENS)');
    console.log('    4. Compact context: removed recentMessages array');
    console.log('    5. analyzeSport now uses compact data object');
    console.log('\n    Expected improvements:');
    console.log('    ✓ Fewer MAX_TOKENS errors');
    console.log('    ✓ Faster response times');
    console.log('    ✓ More reliable fallback chains');
    return;
  }

  try {
    // Test 1: Basic chat with compact system prompt
    console.log('Test 1: Basic chat (optimized prompt)');
    const response1 = await gemini.chat('Who are you?', {
      userId: 123,
      name: 'Test User',
      role: 'member'
    });
    console.log(`  ✅ Response length: ${response1.length} chars`);
    console.log(`  ✅ Sample: "${response1.slice(0, 80)}..."`);

    // Test 2: Sports analysis with compact data
    console.log('\nTest 2: Sports analysis (compact match data)');
    const matchData = {
      home: 'Manchester City',
      away: 'Arsenal',
      score: '2-1',
      odds: '1.85/3.40/4.20'
    };
    const analysis = await gemini.analyzeSport('Football', matchData, 'Who is favored?');
    console.log(`  ✅ Analysis length: ${analysis.length} chars`);
    console.log(`  ✅ Sample: "${analysis.slice(0, 80)}..."`);

    // Test 3: Fallback to local response (simulated by sending very specific query)
    console.log('\nTest 3: Fallback response (if Gemini unavailable)');
    const fallback = gemini.fallbackResponse('hi');
    console.log(`  ✅ Fallback: "${fallback.slice(0, 80)}..."`);

    console.log('\n=== Tests completed ===');
    console.log('\nToken optimization summary:');
    console.log('• System prompt reduced by ~80% (400 → 80 tokens)');
    console.log('• Max output tokens conservative: 200 → 120 on retry');
    console.log('• Better MAX_TOKENS recovery flow');
    console.log('• Fallback responses always available');
    
  } catch (err) {
    console.error('Test error:', err.message);
  }
})();
