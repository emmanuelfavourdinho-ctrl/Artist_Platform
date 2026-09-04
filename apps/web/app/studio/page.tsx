'use client';

import { useState, useEffect, FormEvent } from 'react';
import Image from 'next/image';
import {
  CloudinaryImageUpload,
  UploadedCloudinaryImage,
} from '../../components/ui/CloudinaryImageUpload';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
const API_BASE_URL = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

export default function StudioPage() {
  const [artworks, setArtworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [images, setImages] = useState<UploadedCloudinaryImage[]>([]);

  const loadStudio = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/studio/artworks`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      const json = await res.json();
      if (json.success) setArtworks(json.data.artworks);
    } catch (err) {
      console.error('Failed to load studio works:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudio();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE_URL}/v1/studio/artworks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title, description, price: Number(price), images }),
      });

      if (res.ok) {
        setTitle('');
        setDescription('');
        setPrice('');
        setImages([]);
        setIsModalOpen(false);
        await loadStudio();
      }
    } catch (err) {
      console.error('Failed to create artwork:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--foreground))] px-[var(--container-gutter)] py-12">
      <header className="mb-12 border-b border-[rgb(var(--border)/0.12)] pb-8 flex justify-between items-end">
        <div>
          <span className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--accent))] font-medium">
            Creator Workspace
          </span>
          <h1 className="font-['Fraunces'] text-4xl md:text-6xl font-normal mt-2 tracking-tight">
            Artist Studio
          </h1>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-6 py-3 bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] font-medium text-sm rounded-[var(--radius-sm)] transition-opacity hover:opacity-90"
        >
          + Publish New Work
        </button>
      </header>

      {/* Catalog Table */}
      {loading ? (
        <div className="text-center py-20 text-[rgb(var(--muted))] font-mono text-sm">
          Loading studio inventory...
        </div>
      ) : artworks.length === 0 ? (
        <div className="text-center py-24 bg-[rgb(var(--surface))] rounded-[var(--radius-lg)] border border-[rgb(var(--border)/0.05)]">
          <p className="font-['Fraunces'] text-xl text-[rgb(var(--muted))]">
            No artworks published in your studio catalog yet.
          </p>
        </div>
      ) : (
        <div className="bg-[rgb(var(--surface))] rounded-[var(--radius-lg)] border border-[rgb(var(--border)/0.08)] overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[rgb(var(--border)/0.1)] text-xs uppercase text-[rgb(var(--muted))] font-mono">
                <th className="p-4">Artwork</th>
                <th className="p-4">Title</th>
                <th className="p-4">Price</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border)/0.06)] text-sm">
              {artworks.map((art) => (
                <tr
                  key={art.id}
                  className="hover:bg-[rgb(var(--surface-raised))] transition-colors"
                >
                  <td className="p-4 w-16">
                    <div className="relative w-12 h-12 rounded-[var(--radius-sm)] overflow-hidden bg-[rgb(var(--background))]">
                      <Image src={art.imageUrl} alt={art.title} fill className="object-cover" />
                    </div>
                  </td>
                  <td className="p-4 font-['Fraunces'] font-normal text-base">{art.title}</td>
                  <td className="p-4 font-mono">${Number(art.price).toLocaleString()}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 text-[10px] uppercase font-mono rounded bg-[rgb(var(--accent)/0.15)] text-[rgb(var(--accent))]">
                      {art.available ? 'Available' : 'Sold'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border)/0.15)] p-8 rounded-[var(--radius-lg)] max-w-lg w-full space-y-6">
            <h2 className="font-['Fraunces'] text-2xl">Publish Artwork</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-[rgb(var(--muted))] mb-1 font-mono">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[rgb(var(--background))] border border-[rgb(var(--border)/0.2)] p-3 rounded text-sm text-[rgb(var(--foreground))]"
                />
              </div>
              <CloudinaryImageUpload value={images} onChange={setImages} />
              <div>
                <label className="block text-xs uppercase text-[rgb(var(--muted))] mb-1 font-mono">
                  Price (USD)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full bg-[rgb(var(--background))] border border-[rgb(var(--border)/0.2)] p-3 rounded text-sm text-[rgb(var(--foreground))]"
                />
              </div>
              <div>
                <label className="block text-xs uppercase text-[rgb(var(--muted))] mb-1 font-mono">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[rgb(var(--background))] border border-[rgb(var(--border)/0.2)] p-3 rounded text-sm text-[rgb(var(--foreground))]"
                />
              </div>
              <div className="flex justify-end gap-4 pt-4 border-t border-[rgb(var(--border)/0.1)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--foreground))]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || images.length === 0}
                  className="px-6 py-2 bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] font-medium text-sm rounded transition-opacity disabled:opacity-50"
                >
                  {submitting ? 'Publishing...' : 'Publish Work'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
