chore(lint): finalize runtime entrypoints cleanup and extract legacy callbacks

- worker-final.js:
  - Removed global eslint-disable, fixed imports, scoped relaxations narrowly
  - Eliminated duplicate local handleCallback, now using shared callbacks.js
  - Strict lint passes with zero warnings

- app.js:
  - Improved health logging and callback error observability
  - Simplified chatId extraction for /start auto-reply
  - Exported app for reliable worker import
  - Strict lint passes with zero warnings

- callbacks.js:
  - New shared module exporting handleLegacyCallback(chatId, userId, data, deps)
  - Used as fallback when completeHandler.handleCallbackQuery returns no action
  - Removes duplication and no-unused-vars suppression

Result:
- Both runtime entrypoints are lint-clean under strict rules
- Callback handling centralized and testable
- CI can now safely expand lint coverage beyond changed files

Notes:
- Consider creating a dedicated branch and PR for broader linting of the repo.
- Next: enable CI lint for full repo or changed-files mode, and prepare Docker publish secrets.
