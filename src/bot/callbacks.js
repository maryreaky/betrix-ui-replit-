/**
 * Shared callback helpers
 * Provides a small, testable legacy callback router used by worker and other
 * entrypoints as a fallback when richer handlers don't return an action.
 */
export async function handleLegacyCallback(chatId, userId, data, deps = {}) {
  const { basicHandlers, logger = console } = deps;
  try {
    const callbacks = {
      "CMD:live": () => basicHandlers && basicHandlers.live && basicHandlers.live(chatId, userId),
      "CMD:standings": () => basicHandlers && basicHandlers.standings && basicHandlers.standings(chatId),
      "CMD:tips": () => basicHandlers && basicHandlers.tips && basicHandlers.tips(chatId),
      "CMD:pricing": () => basicHandlers && basicHandlers.pricing && basicHandlers.pricing(chatId),
      "CMD:subscribe": () => basicHandlers && basicHandlers.pricing && basicHandlers.pricing(chatId),
      "CMD:signup": () => basicHandlers && basicHandlers.signup && basicHandlers.signup(chatId, userId),
    };

    if (callbacks[data]) {
      // Call and await in case handler returns a promise
      return await callbacks[data]();
    }

    // Not handled by legacy router
    return null;
  } catch (err) {
    try { logger.error && logger.error(`Legacy callback ${data} failed`, err); } catch (e) { /* swallow */ }
    return null;
  }
}
