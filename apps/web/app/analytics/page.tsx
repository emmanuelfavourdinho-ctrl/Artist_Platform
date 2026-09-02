'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

interface OverviewMetrics {
  totalRevenue: number;
  totalOrders: number;
  activeAuctions: number;
  totalBids: number;
  verifiedArtists: number;
}

interface SalesPoint {
  date: string;
  revenue: number;
}

interface TopArtwork {
  id: string;
  title: string;
  imageUrl?: string;
  salesCount: number;
  totalVolume: number;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [salesHistory, setSalesHistory] = useState<SalesPoint[]>([]);
  const [topArtworks, setTopArtworks] = useState<TopArtwork[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/analytics/dashboard`, {
      headers: { Accept: 'application/json' },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setOverview(json.data.overview);
          setSalesHistory(json.data.salesHistory);
          setTopArtworks(json.data.topArtworks);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--muted))] flex items-center justify-center font-mono text-sm">
        Aggregating system analytics...
      </div>
    );
  }

  const maxRevenue = Math.max(...salesHistory.map((s) => s.revenue), 1);

  return (
    <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--foreground))] px-[var(--container-gutter)] py-12">
      <header className="mb-12 border-b border-[rgb(var(--border)/0.12)] pb-8">
        <span className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--accent))] font-medium">
          Executive Intelligence
        </span>
        <h1 className="font-['Fraunces'] text-4xl md:text-6xl font-normal mt-2 tracking-tight">
          Platform Insights
        </h1>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <div className="bg-[rgb(var(--surface))] p-6 rounded-[var(--radius-lg)] border border-[rgb(var(--border)/0.08)]">
          <span className="text-xs uppercase font-mono text-[rgb(var(--muted))]">
            Gross Revenue
          </span>
          <p className="font-['Fraunces'] text-3xl font-normal mt-2 text-[rgb(var(--accent))]">
            ${overview?.totalRevenue.toLocaleString()}
          </p>
        </div>
        <div className="bg-[rgb(var(--surface))] p-6 rounded-[var(--radius-lg)] border border-[rgb(var(--border)/0.08)]">
          <span className="text-xs uppercase font-mono text-[rgb(var(--muted))]">Total Orders</span>
          <p className="font-['Fraunces'] text-3xl font-normal mt-2">
            {overview?.totalOrders.toLocaleString()}
          </p>
        </div>
        <div className="bg-[rgb(var(--surface))] p-6 rounded-[var(--radius-lg)] border border-[rgb(var(--border)/0.08)]">
          <span className="text-xs uppercase font-mono text-[rgb(var(--muted))]">
            Active Auctions
          </span>
          <p className="font-['Fraunces'] text-3xl font-normal mt-2">
            {overview?.activeAuctions.toLocaleString()}
          </p>
        </div>
        <div className="bg-[rgb(var(--surface))] p-6 rounded-[var(--radius-lg)] border border-[rgb(var(--border)/0.08)]">
          <span className="text-xs uppercase font-mono text-[rgb(var(--muted))]">
            Total Bids Placed
          </span>
          <p className="font-['Fraunces'] text-3xl font-normal mt-2">
            {overview?.totalBids.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sales Chart Bar Representation */}
        <div className="lg:col-span-8 bg-[rgb(var(--surface))] p-6 rounded-[var(--radius-lg)] border border-[rgb(var(--border)/0.08)] space-y-6">
          <div className="flex justify-between items-center border-b border-[rgb(var(--border)/0.08)] pb-4">
            <h2 className="font-['Fraunces'] text-xl">Revenue Velocity (30 Days)</h2>
            <span className="text-xs font-mono text-[rgb(var(--muted))]">USD ($)</span>
          </div>

          {salesHistory.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-[rgb(var(--muted))] font-mono">
              No sales recorded during this window.
            </div>
          ) : (
            <div className="h-64 flex items-end gap-2 pt-8 pb-2 border-b border-[rgb(var(--border)/0.1)]">
              {salesHistory.map((pt, i) => {
                const heightPercent = Math.round((pt.revenue / maxRevenue) * 100);
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center group relative h-full justify-end"
                  >
                    {/* Tooltip */}
                    <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-[rgb(var(--background))] border border-[rgb(var(--border)/0.2)] px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap z-10">
                      {pt.date}: ${pt.revenue.toLocaleString()}
                    </div>
                    <div
                      style={{ height: `${Math.max(heightPercent, 4)}%` }}
                      className="w-full bg-[rgb(var(--accent))] opacity-80 group-hover:opacity-100 rounded-t transition-all"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Performing Artworks List */}
        <div className="lg:col-span-4 bg-[rgb(var(--surface))] p-6 rounded-[var(--radius-lg)] border border-[rgb(var(--border)/0.08)] space-y-6">
          <h2 className="font-['Fraunces'] text-xl border-b border-[rgb(var(--border)/0.08)] pb-4">
            Top Artworks
          </h2>
          <div className="space-y-4">
            {topArtworks.map((art) => (
              <div key={art.id} className="flex items-center gap-4">
                <div className="relative w-12 h-12 rounded overflow-hidden bg-[rgb(var(--background))] flex-shrink-0">
                  {art.imageUrl && (
                    <Image src={art.imageUrl} alt={art.title} fill className="object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-['Fraunces'] text-sm truncate">{art.title}</p>
                  <p className="text-xs text-[rgb(var(--muted))] font-mono">
                    {art.salesCount} sold • ${art.totalVolume.toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
