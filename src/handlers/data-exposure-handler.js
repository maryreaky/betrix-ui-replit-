/**
 * Data Exposure API Handler
 * Provides RESTful endpoints to access all cached sports data
 * Enables debugging, monitoring, and external integrations
 */

import { Logger } from '../utils/logger.js';

const logger = new Logger('DataExposure');

export class DataExposureHandler {
  constructor(router, sportsAggregator) {
    this.router = router;
    this.aggregator = sportsAggregator;
    this.registerRoutes();
  }

  registerRoutes() {
    /**
     * GET /api/data/summary
     * Returns overview of all cached data
     */
    this.router.get('/api/data/summary', async (req, res) => {
      try {
        const summary = await this.aggregator.dataCache.getDataSummary();
        res.json(summary);
      } catch (e) {
        logger.error('Summary failed:', e);
        res.status(500).json({ error: e.message });
      }
    });

    /**
     * GET /api/data/live?source=sportsmonks|footballdata
     * Returns all live matches from specified source
     */
    this.router.get('/api/data/live', async (req, res) => {
      try {
        const { source = 'sportsmonks' } = req.query;
        const matches = await this.aggregator.dataCache.getLiveMatches(source);
        res.json({
          source,
          count: matches.length,
          matches
        });
      } catch (e) {
        logger.error('Live matches endpoint failed:', e);
        res.status(500).json({ error: e.message });
      }
    });

    /**
     * GET /api/data/fixtures?source=sportsmonks|footballdata&league=39
     * Returns all fixtures from specified league and source
     */
    this.router.get('/api/data/fixtures', async (req, res) => {
      try {
        const { source = 'sportsmonks', league = '39' } = req.query;
        const fixtures = await this.aggregator.dataCache.getFixtures(source, league);
        res.json({
          source,
          league,
          count: fixtures.length,
          fixtures
        });
      } catch (e) {
        logger.error('Fixtures endpoint failed:', e);
        res.status(500).json({ error: e.message });
      }
    });

    /**
     * GET /api/data/match/:matchId?source=sportsmonks|footballdata
     * Returns full match details with all available fields
     */
    this.router.get('/api/data/match/:matchId', async (req, res) => {
      try {
        const { matchId } = req.params;
        const { source } = req.query;

        if (source) {
          // Get from specific source
          const match = await this.aggregator.dataCache.getMatchDetail(matchId, source);
          res.json({ matchId, source, match });
        } else {
          // Get from all sources
          const match = await this.aggregator.dataCache.getFullMatchData(matchId);
          res.json(match);
        }
      } catch (e) {
        logger.error('Match detail endpoint failed:', e);
        res.status(500).json({ error: e.message });
      }
    });

    /**
     * GET /api/data/standings/:leagueId?source=sportsmonks|footballdata
     * Returns league standings with all teams and statistics
     */
    this.router.get('/api/data/standings/:leagueId', async (req, res) => {
      try {
        const { leagueId } = req.params;
        const { source = 'sportsmonks' } = req.query;

        const standings = await this.aggregator.dataCache.getStandings(leagueId, source);
        res.json({
          leagueId,
          source,
          standings
        });
      } catch (e) {
        logger.error('Standings endpoint failed:', e);
        res.status(500).json({ error: e.message });
      }
    });

    /**
     * GET /api/data/leagues?source=sportsmonks|footballdata
     * Returns all available leagues
     */
    this.router.get('/api/data/leagues', async (req, res) => {
      try {
        const { source = 'sportsmonks' } = req.query;
        const leagues = await this.aggregator.dataCache.getLeagues(source);
        res.json({
          source,
          count: leagues.length,
          leagues
        });
      } catch (e) {
        logger.error('Leagues endpoint failed:', e);
        res.status(500).json({ error: e.message });
      }
    });

    /**
     * GET /api/data/cache-info
     * Returns detailed cache status and memory usage
     */
    this.router.get('/api/data/cache-info', async (req, res) => {
      try {
        const exportedData = await this.aggregator.dataCache.exportAll();
        const totalSize = exportedData.entries.reduce((sum, e) => sum + e.size, 0);

        res.json({
          ...exportedData,
          totalSize,
          totalEntries: exportedData.entries.length,
          estimatedSizeKb: (totalSize / 1024).toFixed(2)
        });
      } catch (e) {
        logger.error('Cache info endpoint failed:', e);
        res.status(500).json({ error: e.message });
      }
    });

    /**
     * POST /api/data/cache-cleanup
     * Manually trigger cache cleanup (removes expired entries)
     */
    this.router.post('/api/data/cache-cleanup', async (req, res) => {
      try {
        const cleaned = await this.aggregator.dataCache.cleanup();
        res.json({
          success: true,
          cleaned,
          message: `Removed ${cleaned} expired cache entries`
        });
      } catch (e) {
        logger.error('Cache cleanup failed:', e);
        res.status(500).json({ error: e.message });
      }
    });

    /**
     * GET /api/data/export
     * Export all cached data as JSON
     */
    this.router.get('/api/data/export', async (req, res) => {
      try {
        const summary = await this.aggregator.dataCache.getDataSummary();
        const smLive = await this.aggregator.dataCache.getLiveMatches('sportsmonks');
        const fdLive = await this.aggregator.dataCache.getLiveMatches('footballdata');
        const smLeagues = await this.aggregator.dataCache.getLeagues('sportsmonks');

        const exported = {
          exportedAt: new Date().toISOString(),
          summary,
          data: {
            sportsmonks: {
              live: smLive,
              leagues: smLeagues
            },
            footballdata: {
              live: fdLive
            }
          }
        };

        // Set response headers for file download
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="sports-data-${Date.now()}.json"`);
        res.json(exported);
      } catch (e) {
        logger.error('Export failed:', e);
        res.status(500).json({ error: e.message });
      }
    });

    /**
     * GET /api/data/schema
     * Returns the API schema/documentation
     */

    /**
     * GET /api/data/debug/raw-lives
     * Debug endpoint: returns latest raw live payloads from RawDataCache (sanitized + truncated)
     * Query params: `source` (sportsmonks|footballdata), `limit` (number, default 20)
     */
    this.router.get('/api/data/debug/raw-lives', async (req, res) => {
      try {
        const { source = 'sportsmonks', limit = '20' } = req.query;
        const max = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));

        // Get raw live matches from RawDataCache via aggregator.dataCache
        const raw = await this.aggregator.dataCache.getLiveMatches(source);
        const count = (raw || []).length;

        // Sanitizer: shallow clone and truncate long strings, remove suspicious keys
        function sanitize(obj) {
          if (obj == null) return obj;
          if (typeof obj === 'string') return obj.length > 1000 ? obj.substring(0, 1000) + '...<truncated>' : obj;
          if (typeof obj !== 'object') return obj;
          const out = Array.isArray(obj) ? [] : {};
          const keys = Object.keys(obj).slice(0, 200);
          for (const k of keys) {
            if (/token|api_token|password|secret/i.test(k)) {
              out[k] = 'REDACTED';
              continue;
            }
            const v = obj[k];
            if (typeof v === 'string' && v.length > 1000) {
              out[k] = v.substring(0, 1000) + '...<truncated>';
            } else if (typeof v === 'object' && v !== null) {
              // shallow stringify nested arrays/objects up to one level
              try {
                if (Array.isArray(v)) {
                  out[k] = v.slice(0, 50).map(it => (typeof it === 'string' ? (it.length>300?it.substring(0,300)+'...':it) : (typeof it==='object'? JSON.stringify(it).substring(0,300) : it)));
                } else {
                  out[k] = Object.keys(v).slice(0,50).reduce((acc, kk) => { acc[kk] = (typeof v[kk] === 'string' && v[kk].length>300) ? v[kk].substring(0,300)+'...' : v[kk]; return acc; }, {});
                }
              } catch (e) {
                out[k] = String(v).substring(0,300);
              }
            } else {
              out[k] = v;
            }
          }
          return out;
        }

        const sample = (raw || []).slice(0, max).map(sanitize);
        res.json({ source, count, returned: sample.length, sample });
      } catch (e) {
        logger.error('Debug raw-lives failed:', e?.message || String(e));
        res.status(500).json({ error: e?.message || String(e) });
      }
    });

    this.router.get('/api/data/schema', (req, res) => {
      const schema = {
        version: '1.0',
        description: 'Sports Data Exposure API - Access all cached sports data',
        endpoints: {
          'GET /api/data/summary': {
            description: 'Overview of all cached data',
            response: { summary: 'object' }
          },
          'GET /api/data/live': {
            description: 'All live matches from source',
            query: { source: 'string (sportsmonks|footballdata)' },
            response: { source: 'string', count: 'number', matches: 'array' }
          },
          'GET /api/data/fixtures': {
            description: 'All fixtures from league',
            query: { source: 'string', league: 'string' },
            response: { source: 'string', league: 'string', count: 'number', fixtures: 'array' }
          },
          'GET /api/data/match/:matchId': {
            description: 'Full match details with all fields',
            params: { matchId: 'string|number' },
            query: { source: 'string (optional)' },
            response: { matchId: 'string', source: 'string', match: 'object' }
          },
          'GET /api/data/standings/:leagueId': {
            description: 'League standings and statistics',
            params: { leagueId: 'string|number' },
            query: { source: 'string' },
            response: { leagueId: 'string', source: 'string', standings: 'object' }
          },
          'GET /api/data/leagues': {
            description: 'All available leagues',
            query: { source: 'string' },
            response: { source: 'string', count: 'number', leagues: 'array' }
          },
          'GET /api/data/cache-info': {
            description: 'Cache status and memory usage',
            response: { totalSize: 'number', totalEntries: 'number', estimatedSizeKb: 'string' }
          },
          'POST /api/data/cache-cleanup': {
            description: 'Manually cleanup expired cache entries',
            response: { success: 'boolean', cleaned: 'number', message: 'string' }
          },
          'GET /api/data/export': {
            description: 'Export all cached data as JSON file',
            response: { exportedAt: 'ISO string', summary: 'object', data: 'object' }
          }
        },
        sources: ['sportsmonks', 'footballdata'],
        majorLeagues: {
          '39': 'Premier League',
          '140': 'La Liga',
          '135': 'Serie A',
          '61': 'Ligue 1',
          '78': 'Bundesliga',
          '2': 'Champions League'
        }
      };

      res.json(schema);
    });

    logger.info('✅ Data exposure endpoints registered');
  }
}

export default DataExposureHandler;
