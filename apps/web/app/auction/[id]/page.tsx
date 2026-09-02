'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

interface BidItem {
  id: string;
  amount: number;
  userEmail: string;
  createdAt: string;
}

export default function AuctionLivePage() {
  const params = useParams();
  const auctionId = params.id as string;

  const [auction, setAuction] = useState<any>(null);
  const [bids, setBids] = useState<BidItem[]>([]);
  const [currentBid, setCurrentBid] = useState<number>(0);
  const [customBid, setCustomBid] = useState<string>('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Fetch initial auction state
    fetch(`${API_URL}/api/v1/auctions/${auctionId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setAuction(json.data.auction);
          setCurrentBid(json.data.auction.currentBid);
          setBids(json.data.bids);
        }
      })
      .finally(() => setLoading(false));

    // 2. Initialize Socket.IO connection
    const socketClient = io(`${API_URL}/auctions`, {
      transports: ['websocket'],
    });

    socketClient.emit('join_auction', auctionId);

    socketClient.on('new_bid', (data: { currentBid: number; bid: BidItem }) => {
      setCurrentBid(data.currentBid);
      setBids((prev) => [data.bid, ...prev]);
      setErrorMessage(null);
    });

    socketClient.on('bid_error', (data: { message: string }) => {
      setErrorMessage(data.message);
    });

    setSocket(socketClient);

    return () => {
      socketClient.emit('leave_auction', auctionId);
      socketClient.disconnect();
    };
  }, [auctionId]);

  const handleSubmitBid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !customBid) return;

    const bidValue = Number(customBid);
    socket.emit('place_bid', {
      auctionId,
      userId: 'mock-user-id', // Replaced dynamically by Auth Context
      userEmail: 'collector@gallery.com',
      amount: bidValue,
    });

    setCustomBid('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--muted))] flex items-center justify-center font-mono text-sm">
        Loading live auction session...
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--foreground))] p-12 text-center font-['Fraunces'] text-2xl">
        Auction Session Not Found
      </div>
    );
  }

  const minNextBid = currentBid + auction.minBidIncrement;

  return (
    <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--foreground))] px-[var(--container-gutter)] py-12">
      <header className="mb-8 border-b border-[rgb(var(--border)/0.12)] pb-6 flex justify-between items-center">
        <div>
          <span className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--accent))] font-medium flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Live Auction
          </span>
          <h1 className="font-['Fraunces'] text-3xl md:text-5xl font-normal mt-1">
            {auction.artwork?.title}
          </h1>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Artwork Display */}
        <div className="lg:col-span-7">
          <div className="relative aspect-[4/5] rounded-[var(--radius-lg)] overflow-hidden bg-[rgb(var(--surface))] border border-[rgb(var(--border)/0.08)]">
            <Image
              src={auction.artwork?.imageUrl}
              alt={auction.artwork?.title}
              fill
              className="object-cover"
            />
          </div>
        </div>

        {/* Bidding Panel & Stream */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-8">
          <div className="bg-[rgb(var(--surface))] p-6 rounded-[var(--radius-lg)] border border-[rgb(var(--border)/0.1)] space-y-6">
            <div>
              <span className="text-xs font-mono uppercase text-[rgb(var(--muted))]">
                Current Highest Bid
              </span>
              <p className="font-['Fraunces'] text-4xl text-[rgb(var(--accent))] mt-1">
                ${currentBid.toLocaleString()}
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded font-mono">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmitBid} className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-[rgb(var(--muted))] mb-2 font-mono">
                  Enter Bid (Min. ${minNextBid.toLocaleString()})
                </label>
                <div className="flex gap-3">
                  <input
                    type="number"
                    min={minNextBid}
                    step={auction.minBidIncrement}
                    value={customBid}
                    onChange={(e) => setCustomBid(e.target.value)}
                    placeholder={minNextBid.toString()}
                    className="flex-1 bg-[rgb(var(--background))] border border-[rgb(var(--border)/0.2)] p-3 rounded text-sm text-[rgb(var(--foreground))]"
                  />
                  <button
                    type="submit"
                    className="px-6 py-3 bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] font-medium text-sm rounded transition-opacity hover:opacity-90"
                  >
                    Place Bid
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Real-time Bid History Feed */}
          <div className="bg-[rgb(var(--surface))] p-6 rounded-[var(--radius-lg)] border border-[rgb(var(--border)/0.1)] flex-1 flex flex-col">
            <h3 className="text-xs uppercase font-mono tracking-widest text-[rgb(var(--muted))] mb-4">
              Live Bid Activity
            </h3>
            <div className="space-y-3 overflow-y-auto max-h-64 pr-2 divide-y divide-[rgb(var(--border)/0.06)]">
              {bids.map((bid) => (
                <div
                  key={bid.id}
                  className="pt-3 flex justify-between items-center text-sm font-mono"
                >
                  <div>
                    <span className="text-[rgb(var(--foreground))]">{bid.userEmail}</span>
                    <span className="block text-[10px] text-[rgb(var(--muted))]">
                      {new Date(bid.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <span className="font-semibold text-[rgb(var(--accent))]">
                    ${bid.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
