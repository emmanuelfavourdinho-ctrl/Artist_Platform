'use client';

import { useState } from 'react';

export function ShareActions({ url, title, className = '' }: { url: string; title: string; className?: string }) {
  const [status, setStatus] = useState('');

  async function share() {
    setStatus('');
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        setStatus('Share sheet opened.');
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    await copyLink();
  }

  async function copyLink() {
    setStatus('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setStatus('Link copied.');
    } catch {
      setStatus('Could not copy automatically. Select and copy the link from the address bar.');
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button type="button" onClick={() => void share()} className="min-h-10 rounded bg-accent px-4 text-sm font-medium text-background hover:opacity-90">Share</button>
      <button type="button" onClick={() => void copyLink()} className="min-h-10 rounded border border-border/20 px-4 text-sm text-foreground hover:border-accent hover:text-accent">Copy link</button>
      <span role="status" aria-live="polite" className="text-xs text-muted">{status}</span>
    </div>
  );
}
