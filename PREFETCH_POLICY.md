Prefetching & Cache Policy
==========================

This project includes a prefetch scheduler that warms caches for free-data providers. Use the following guidance when configuring the scheduler and cache TTLs.

- Default interval: 60 seconds. This is intended to keep feeds reasonably fresh without heavy polling.
- Minimum recommended interval: 15 seconds. Polling more frequently risks breaching provider rate-limits and terms.
- Aggressive polling (sub-10s): discouraged unless you have explicit permission from the data provider.
- Cache TTLs: set short TTLs for volatile sources (RSS, ScoreBat) — e.g., 30–120s. Longer TTLs for static CSVs/historical files (hours to days).
- Backoff on failure: the scheduler should back off on repeated failures for a specific source (exponential backoff). The current scheduler publishes `prefetch:error` on failures; consumers should observe error rates and reduce polling frequency if failures spike.
- Respect robots.txt: scrapers should check `robots.txt` and honor Crawl-delay directives.

Operational notes
- Monitor `prefetch:error` and `prefetch:updates` channels to detect provider throttling and outages.
- If you plan to increase polling frequency, contact the provider or use official paid APIs when available.
