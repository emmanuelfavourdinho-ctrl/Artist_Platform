import type { Request, Response, NextFunction } from 'express';
import { esClient, ARTWORK_INDEX } from '../config/elasticsearch.js';

export async function searchArtworks(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { q, category, minPrice, maxPrice, from = 0, size = 12 } = req.query;

    const must: any[] = [];
    const filter: any[] = [{ term: { available: true } }];

    if (q) {
      must.push({
        multi_match: {
          query: String(q),
          fields: ['title^3', 'description', 'artistName^2'],
          fuzziness: 'AUTO',
        },
      });
    } else {
      must.push({ match_all: {} });
    }

    if (category) {
      filter.push({ term: { category: String(category) } });
    }

    if (minPrice || maxPrice) {
      const range: any = {};
      if (minPrice) range.gte = Number(minPrice);
      if (maxPrice) range.lte = Number(maxPrice);
      filter.push({ range: { price: range } });
    }

    const response = await esClient.search({
      index: ARTWORK_INDEX,
      from: Number(from),
      size: Number(size),
      query: {
        bool: { must, filter },
      },
    });

    const hits = response.hits.hits.map((hit: any) => hit._source);
    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : (response.hits.total?.value ?? 0);

    res.json({
      success: true,
      data: { artworks: hits, total },
    });
  } catch (err) {
    next(err);
  }
}

export async function suggestArtworks(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { q } = req.query;

    if (!q || String(q).trim().length === 0) {
      res.json({ success: true, data: { suggestions: [] } });
      return;
    }

    const response = await esClient.search({
      index: ARTWORK_INDEX,
      suggest: {
        artwork_suggest: {
          prefix: String(q),
          completion: {
            field: 'suggest',
            fuzzy: { fuzziness: 1 },
            size: 5,
          },
        },
      },
    });

    const suggestResult = response.suggest?.artwork_suggest;
    const firstBucket = Array.isArray(suggestResult) ? suggestResult[0] : undefined;
    const optionsArray = Array.isArray(firstBucket?.options) ? firstBucket.options : [];

    const suggestions = optionsArray.map((opt: any) => ({
      text: opt.text,
      artwork: opt._source,
    }));

    res.json({ success: true, data: { suggestions } });
  } catch (err) {
    next(err);
  }
}
