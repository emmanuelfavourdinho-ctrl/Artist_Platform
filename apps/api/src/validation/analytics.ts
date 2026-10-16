import { z } from 'zod';

/*
  Explainer: analytics windows are an explicit, closed set rather than a
  free-form `days` number. The old endpoint did `Number(req.query.days)`
  with no validation, so `?days=abc` became NaN (an Invalid Date filter)
  and `?days=-5` silently queried the future. A fixed list keeps the
  query bounded (the time-series is aggregated in SQL, but an unbounded
  range is still an unbounded scan) and makes the window shown in the UI
  identical to the one the server actually used.
*/
export const ANALYTICS_RANGES = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
} as const;

export type AnalyticsRangeKey = keyof typeof ANALYTICS_RANGES;

export const analyticsQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d', '365d']).default('30d'),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
