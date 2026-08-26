import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/httpError.js';
import type { ListArtworksQuery } from '../validation/artwork.js';

// 'featured' has no dedicated curation signal yet (no "featured" flag or
// score on Artwork) — it's a placeholder equal to 'newest' until a real
// featured-ranking mechanism exists (e.g. an admin-set flag, or a
// computed score). Flagging this explicitly rather than silently
// shipping a fake "featured" sort.
const SORT_MAP: Record<ListArtworksQuery['sort'], Prisma.ArtworkOrderByWithRelationInput> = {
  featured: { publishedAt: 'desc' },
  newest: { publishedAt: 'desc' },
  price_asc: { price: 'asc' },
  price_desc: { price: 'desc' },
};

interface InventorySnapshot {
  quantity: number;
  reservedQuantity: number;
  soldQuantity: number;
}

/*
    Explainer: "available" is never a stored boolean — it's computed here,
    every time, from the actual inventory numbers. Storing a cached
    available/unavailable flag risks it silently drifting out of sync with
    reality (e.g. after a sale). No inventory record at all means the
    artwork isn't purchasable yet, not an error — some artworks may be
    published for display before inventory is configured.
    */
function isAvailable(inventory: InventorySnapshot | null): boolean {
  if (!inventory) return false;
  return inventory.quantity - inventory.reservedQuantity - inventory.soldQuantity > 0;
}

/*
    Explainer: GET /api/v1/artworks — public gallery listing. The
    status/visibility filter below is the ENTIRE enforcement of "only
    published, public artworks are browsable" — baked into the query
    itself, the same pattern used for review moderation. A draft artwork
    or one an artist marked private can never leak through this endpoint,
    regardless of what filters a client sends.
    */
export async function listArtworks(req: Request, res: Response) {
  const query = req.query as unknown as ListArtworksQuery;

  const where: Prisma.ArtworkWhereInput = {
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
  };

  if (query.category) {
    where.categories = { some: { category: { slug: query.category } } };
  }
  if (query.medium) {
    where.mediums = { some: { medium: { slug: query.medium } } };
  }
  if (query.style) {
    where.styles = { some: { style: { slug: query.style } } };
  }
  if (query.theme) {
    where.themes = { some: { theme: { slug: query.theme } } };
  }
  if (query.artist) {
    where.artist = { slug: query.artist };
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.price = {
      ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
    };
  }

  const [artworks, total] = await Promise.all([
    prisma.artwork.findMany({
      where,
      orderBy: SORT_MAP[query.sort],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        slug: true,
        title: true,
        price: true,
        currency: true,
        publishedAt: true,
        images: {
          where: { isPrimary: true },
          take: 1,
          select: { url: true, altText: true, width: true, height: true },
        },
        artist: {
          select: { displayName: true, slug: true, verificationStatus: true },
        },
        inventory: {
          select: { quantity: true, reservedQuantity: true, soldQuantity: true },
        },
      },
    }),
    prisma.artwork.count({ where }),
  ]);

  const data = artworks.map((artwork) => ({
    id: artwork.id,
    slug: artwork.slug,
    title: artwork.title,
    price: artwork.price,
    currency: artwork.currency,
    image: artwork.images[0] ?? null,
    artist: {
      name: artwork.artist.displayName,
      slug: artwork.artist.slug,
      verified: artwork.artist.verificationStatus === 'VERIFIED',
    },
    available: isAvailable(artwork.inventory),
  }));

  res.json({
    status: 'success',
    data,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  });
}

/*
    Explainer: GET /api/v1/artworks/:slug — the artwork detail page.
    Deliberately findFirst with the SAME status/visibility filter as the
    list endpoint, not findUnique by id — this means a direct link to a
    draft or unpublished artwork's slug 404s exactly like a nonexistent
    one does, rather than leaking a "this exists but isn't public yet"
    signal to anyone who guesses or scrapes a slug.

    No review data included here on purpose — see the note in the chat
    response about the artist-vs-artwork review architecture conflict
    that needs resolving before this can be filled in correctly.
    */
export async function getArtworkBySlug(req: Request, res: Response) {
  const { slug } = req.params;

  const artwork = await prisma.artwork.findFirst({
    where: { slug, status: 'PUBLISHED', visibility: 'PUBLIC' },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      price: true,
      currency: true,
      yearCreated: true,
      width: true,
      height: true,
      depth: true,
      weight: true,
      materials: true,
      publishedAt: true,
      images: {
        orderBy: { position: 'asc' },
        select: { id: true, url: true, altText: true, width: true, height: true, isPrimary: true },
      },
      categories: { select: { category: { select: { name: true, slug: true } } } },
      styles: { select: { style: { select: { name: true, slug: true } } } },
      themes: { select: { theme: { select: { name: true, slug: true } } } },
      mediums: { select: { medium: { select: { name: true, slug: true } } } },
      inventory: { select: { quantity: true, reservedQuantity: true, soldQuantity: true } },
      artist: {
        select: {
          displayName: true,
          slug: true,
          biography: true,
          profileImageUrl: true,
          verificationStatus: true,
        },
      },
    },
  });

  if (!artwork) {
    throw new HttpError(404, 'Artwork not found', { code: 'ARTWORK_NOT_FOUND' });
  }

  res.json({
    status: 'success',
    data: {
      id: artwork.id,
      slug: artwork.slug,
      title: artwork.title,
      description: artwork.description,
      price: artwork.price,
      currency: artwork.currency,
      yearCreated: artwork.yearCreated,
      dimensions: {
        width: artwork.width,
        height: artwork.height,
        depth: artwork.depth,
        weight: artwork.weight,
      },
      materials: artwork.materials,
      publishedAt: artwork.publishedAt,
      images: artwork.images,
      categories: artwork.categories.map((entry) => entry.category),
      styles: artwork.styles.map((entry) => entry.style),
      themes: artwork.themes.map((entry) => entry.theme),
      mediums: artwork.mediums.map((entry) => entry.medium),
      available: isAvailable(artwork.inventory),
      artist: {
        name: artwork.artist.displayName,
        slug: artwork.artist.slug,
        biography: artwork.artist.biography,
        profileImageUrl: artwork.artist.profileImageUrl,
        verified: artwork.artist.verificationStatus === 'VERIFIED',
      },
    },
  });
}
