'use client';

/**
 * Watchlist Collections Page
 *
 * Create, view, and manage custom movie/series/documentary collections
 * persisted in SQLite via `/api/library/collections`.
 */

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { FolderPlus, Layers, Plus, Star, Trash2, X } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { PosterFallback } from '@/components/movies/PosterFallback';
import { useWatchlist } from '@/hooks/useWatchlist';
import {
  addToCollection,
  createCollection,
  deleteCollection,
  fetchCollections,
  removeFromCollection,
} from '@/services/libraryService';
import type { Collection } from '@/types';

export default function CollectionsPage() {
  const { items: watchlistItems } = useWatchlist();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickAddTarget, setQuickAddTarget] = useState<Record<number, string>>({});

  const refresh = useCallback(async () => {
    try {
      const cols = await fetchCollections();
      setCollections(cols);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load collections from backend.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchCollections()
      .then((cols) => {
        if (active) {
          setCollections(cols);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'Unable to load collections from backend.'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await createCollection(trimmed, description.trim());
      setName('');
      setDescription('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create collection.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteCollection(colId: number) {
    try {
      await deleteCollection(colId);
      setCollections((prev) => prev.filter((c) => c.id !== colId));
    } catch {
      setError('Failed to delete collection.');
    }
  }

  async function handleRemoveItem(colId: number, contentId: number) {
    try {
      await removeFromCollection(colId, contentId);
      await refresh();
    } catch {
      setError('Failed to remove item from collection.');
    }
  }

  async function handleQuickAddFromWatchlist(colId: number) {
    const selectedId = Number(quickAddTarget[colId] ?? '');
    if (!Number.isFinite(selectedId) || selectedId <= 0) return;
    try {
      await addToCollection(colId, selectedId);
      setQuickAddTarget((prev) => ({ ...prev, [colId]: '' }));
      await refresh();
    } catch {
      setError('Failed to add item to collection.');
    }
  }

  return (
    <Container className="pt-28 pb-20 space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-[#A68BC7]">
            Curated Lists
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#F5F2F7] tracking-tight">
            Collections
          </h1>
          <p className="text-sm text-[#AAA5B3]">
            Organize your movies, series, and documentaries into custom themed lists persisted in SQLite.
          </p>
        </div>

        <Button href="/discover" variant="secondary" size="md">
          Discover Titles
        </Button>
      </div>

      {/* Create New Collection Form */}
      <form
        onSubmit={handleCreate}
        className="p-5 sm:p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-4 max-w-3xl"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-[#F5F2F7]">
          <FolderPlus size={16} className="text-[#A68BC7]" />
          Create New Collection
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collection name (e.g. Weekend Thrillers)"
            maxLength={80}
            required
            className="h-11 px-4 rounded-xl bg-[#101014] border border-white/[0.1] text-sm text-[#F5F2F7] placeholder:text-[#77727F] focus:outline-none focus:border-[#8060A8]"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional short note or mood..."
            maxLength={300}
            className="h-11 px-4 rounded-xl bg-[#101014] border border-white/[0.1] text-sm text-[#F5F2F7] placeholder:text-[#77727F] focus:outline-none focus:border-[#8060A8]"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" size="md" disabled={creating || !name.trim()}>
            <Plus size={15} />
            {creating ? 'Creating…' : 'Create Collection'}
          </Button>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      </form>

      {/* Collections List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-48 rounded-2xl bg-[#17161D] border border-white/[0.06] animate-pulse"
            />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <div className="py-16 px-6 rounded-2xl bg-[#17161D] border border-white/[0.08] text-center space-y-3 max-w-xl mx-auto">
          <div className="w-12 h-12 mx-auto rounded-full bg-[#8060A8]/15 border border-[#8060A8]/30 flex items-center justify-center text-[#A68BC7]">
            <Layers size={20} />
          </div>
          <h2 className="font-serif text-2xl font-semibold text-[#F5F2F7]">
            No collections yet
          </h2>
          <p className="text-sm text-[#AAA5B3]">
            Create your first collection above, then save titles from any detail page or quick-add from your Watchlist.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {collections.map((col) => (
            <section
              key={col.id}
              className="p-5 sm:p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-serif text-xl sm:text-2xl font-semibold text-[#F5F2F7]">
                      {col.name}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#101014] border border-white/[0.08] text-xs text-[#A68BC7]">
                      {col.item_count} {col.item_count === 1 ? 'title' : 'titles'}
                    </span>
                  </div>
                  {col.description && (
                    <p className="text-xs sm:text-sm text-[#AAA5B3]">{col.description}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {watchlistItems.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={quickAddTarget[col.id] ?? ''}
                        onChange={(e) =>
                          setQuickAddTarget((prev) => ({ ...prev, [col.id]: e.target.value }))
                        }
                        className="h-9 px-3 rounded-xl bg-[#101014] border border-white/[0.1] text-xs text-[#F5F2F7] max-w-[180px]"
                      >
                        <option value="">Quick-add from Watchlist…</option>
                        {watchlistItems.map((wl) => (
                          <option key={wl.id} value={wl.id}>
                            {wl.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleQuickAddFromWatchlist(col.id)}
                        disabled={!quickAddTarget[col.id]}
                        className="h-9 px-3 rounded-xl bg-[#8060A8] hover:bg-[#9170ba] text-white text-xs font-medium disabled:opacity-40 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteCollection(col.id)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-white/[0.08] text-xs text-[#AAA5B3] hover:text-red-300 hover:border-red-400/30 transition-colors"
                  >
                    <Trash2 size={13} />
                    Delete
                  </button>
                </div>
              </div>

              {col.items.length === 0 ? (
                <p className="text-xs text-[#77727F]">
                  This collection is empty. Open any title page and click &ldquo;Save to Collection&rdquo; or use Quick-add above.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {col.items.map((item) => (
                    <div
                      key={item.content_id}
                      className="p-3 rounded-xl bg-[#101014] border border-white/[0.06] flex items-center gap-3 group"
                    >
                      <Link
                        href={`/movie/${item.content_id}`}
                        className="w-12 h-18 rounded-lg overflow-hidden bg-[#17161D] shrink-0 relative border border-white/[0.06]"
                      >
                        {item.poster_url ? (
                          <Image
                            src={item.poster_url}
                            alt={item.title}
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        ) : (
                          <PosterFallback title={item.title} />
                        )}
                      </Link>
                      <div className="min-w-0 flex-1 space-y-1">
                        <Link
                          href={`/movie/${item.content_id}`}
                          className="block text-sm font-medium text-[#F5F2F7] group-hover:text-[#A68BC7] truncate transition-colors"
                        >
                          {item.title}
                        </Link>
                        <p className="text-[11px] text-[#77727F] flex items-center gap-1.5">
                          {item.release_year && <span>{item.release_year}</span>}
                          {item.rating != null && (
                            <span className="inline-flex items-center gap-0.5 text-[#D9A45D]">
                              <Star size={10} className="fill-[#D9A45D]" />
                              {item.rating.toFixed(1)}
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(col.id, item.content_id)}
                        aria-label={`Remove ${item.title} from ${col.name}`}
                        className="p-1.5 rounded-lg text-[#77727F] hover:text-red-300 hover:bg-white/[0.04] transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </Container>
  );
}
