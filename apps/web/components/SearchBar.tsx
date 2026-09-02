'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length > 1) {
        fetch(`${API_URL}/api/v1/search/suggest?q=${encodeURIComponent(query)}`)
          .then((res) => res.json())
          .then((json) => {
            if (json.success) {
              setSuggestions(json.data.suggestions);
              setIsOpen(true);
            }
          })
          .catch(console.error);
      } else {
        setSuggestions([]);
        setIsOpen(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setIsOpen(false);
      router.push(`/search?q=${encodeURIComponent(query)}` as Route);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full max-w-xl">
      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search catalog by title, artist, or style..."
          className="w-full bg-[rgb(var(--surface))] border border-[rgb(var(--border)/0.15)] text-[rgb(var(--foreground))] px-5 py-3.5 pr-12 rounded-[var(--radius-md)] text-sm focus:outline-none focus:border-[rgb(var(--accent))]"
        />
        <button
          type="submit"
          className="absolute right-4 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))] hover:text-[rgb(var(--foreground))]"
        >
          🔍
        </button>
      </form>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-[rgb(var(--surface))] border border-[rgb(var(--border)/0.15)] rounded-[var(--radius-md)] shadow-2xl overflow-hidden z-50 divide-y divide-[rgb(var(--border)/0.06)]">
          {suggestions.map((item, idx) => (
            <div
              key={idx}
              onClick={() => {
                setIsOpen(false);
                router.push(`/artwork/${item.artwork.id}` as Route);
              }}
              className="flex items-center gap-4 p-3 hover:bg-[rgb(var(--surface-raised))] cursor-pointer transition-colors"
            >
              <div className="relative w-10 h-12 bg-[rgb(var(--background))] rounded overflow-hidden flex-shrink-0">
                <Image src={item.artwork.imageUrl} alt={item.text} fill className="object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-['Fraunces'] text-sm truncate text-[rgb(var(--foreground))]">
                  {item.text}
                </p>
                <p className="text-xs text-[rgb(var(--muted))] font-mono">
                  {item.artwork.artistName} • ${Number(item.artwork.price).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
