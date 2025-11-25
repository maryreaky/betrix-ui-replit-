LEGAL / Data Reuse Notes
=======================

This repository integrates a number of third-party free data sources. This file documents the intended reuse and high-level legal considerations — it is not legal advice.

Sources and short notes
- Wikipedia / Wikidata: content is generally available under CC BY-SA. Any verbatim reuse (text excerpts) must include proper attribution and, when applicable, share-alike obligations. Use short summarization and link to the original article rather than reproducing full article content.
- OpenLigaDB: free JSON API. Check the source site for its specific license and attribution requirements before heavy redistribution.
- ScoreBat: provides a free highlights API and embeddable widgets. Commercial reuse may be restricted; follow ScoreBat's terms and use embeds where possible.
- BBC / Guardian / ESPN RSS: RSS feeds are often subject to publisher terms; headlines and short snippets may be acceptable, but copying full articles is not. Link to the original article and avoid redistributing full content.
- football-data.co.uk CSVs: often provided for research and non-commercial reuse; verify license on each CSV before commercial use.
- FBref / Understat (polite scraping): scraping is subject to the site's robots.txt and terms of service. Respect rate limits and only collect data needed for display and analytics.

Recommendations
- Always link back to the original article or data source when presenting third-party content.
- Avoid copying entire articles or large verbatim excerpts.
- Implement caching with reasonable TTLs to reduce scraping/requests.
- When in doubt about commercial reuse, request permission from the data provider.

If you need a provider-specific legal summary for production, consult legal counsel and keep a log of the fetched resources and timestamps for auditing.
