import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/elasticsearch.js', () => ({
  esClient: { search: vi.fn() },
  ARTWORK_INDEX: 'artworks',
}));

import { esClient } from '../config/elasticsearch.js';
import { suggestArtworks } from '../controllers/searchController.js';

describe('suggestArtworks eligibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only available USD suggestions and requests a bounded candidate set', async () => {
    vi.mocked(esClient.search).mockResolvedValue({
      suggest: {
        artwork_suggest: [{
          options: [
            { text: 'Unavailable USD', _source: { id: 'sold', available: false, currency: 'USD' } },
            { text: 'Legacy XAF', _source: { id: 'xaf', available: true, currency: 'XAF' } },
            { text: 'Unindexed currency', _source: { id: 'old', available: true } },
            { text: 'Eligible USD', _source: { id: 'usd', available: true, currency: 'USD' } },
            { text: 'Eligible lowercase USD', _source: { id: 'lower', available: true, currency: 'usd' } },
          ],
        }],
      },
    } as never);
    const response = { json: vi.fn() };

    await suggestArtworks(
      { query: { q: 'blue' } } as never,
      response as never,
      vi.fn(),
    );

    expect(vi.mocked(esClient.search).mock.calls[0]?.[0]).toMatchObject({
      suggest: { artwork_suggest: { completion: { size: 25 } } },
    });
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: {
        suggestions: [
          { text: 'Eligible USD', artwork: { id: 'usd', available: true, currency: 'USD' } },
          { text: 'Eligible lowercase USD', artwork: { id: 'lower', available: true, currency: 'usd' } },
        ],
      },
    });
  });

  it('returns an empty list when no indexed suggestions are eligible', async () => {
    vi.mocked(esClient.search).mockResolvedValue({
      suggest: {
        artwork_suggest: [{
          options: [
            { text: 'Sold', _source: { available: false, currency: 'USD' } },
            { text: 'Unverified', _source: { available: true, currency: 'XAF' } },
          ],
        }],
      },
    } as never);
    const response = { json: vi.fn() };

    await suggestArtworks(
      { query: { q: 'blue' } } as never,
      response as never,
      vi.fn(),
    );

    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { suggestions: [] },
    });
  });
});
