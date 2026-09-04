import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/httpError.js';

interface InventorySnapshot {
  quantity: number;
  reservedQuantity: number;
  soldQuantity: number;
}

// Duplicated from artworkControllers.ts rather than shared — under
// deadline, a 3-line duplication is cheaper than the risk of a shared
// import breaking two endpoints at once. Worth extracting to lib/ later.
function isAvailable(inventory: InventorySnapshot | null): boolean {
  if (!inventory) return false;
  return inventory.quantity - inventory.reservedQuantity - inventory.soldQuantity > 0;
}

/*
  Explainer: GET /api/v1/artists/:slug. Reviews here are NOT a separate
  artist-scoped table — schema.prisma only has Review.artworkId, not
  Review.artistId. This aggregates APPROVED reviews across every one of
  the artist's artworks via the artwork relation, so the profile page
  can show "average rating" and "written reviews" the way the product
  spec wants, without a schema change.
*/
export async function getArtistBySlug(req: Request, res: Response) {
  const { slug } = req.params;

  const artist = await prisma.artistProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      displayName: true,
      slug: true,
      biography: true,
      artisticStatement: true,
      location: true,
      profileImageUrl: true,
      coverImageUrl: true,
      verificationStatus: true,
      createdAt: true,
    },
  });

  if (!artist) {
    throw new HttpError(404, 'Artist not found', { code: 'ARTIST_NOT_FOUND' });
  }

  const [artworks, ratingAggregate, reviews] = await Promise.all([
    prisma.artwork.findMany({
      where: { artistId: artist.id, status: 'PUBLISHED', visibility: 'PUBLIC' },
      orderBy: { publishedAt: 'desc' },
      take: 24,
      select: {
        id: true,
        slug: true,
        title: true,
        price: true,
        currency: true,
        images: { where: { isPrimary: true }, take: 1, select: { url: true, altText: true } },
        inventory: { select: { quantity: true, reservedQuantity: true, soldQuantity: true } },
      },
    }),
    prisma.review.aggregate({
      where: { status: 'APPROVED', artwork: { artistId: artist.id } },
      _avg: { rating: true },
      _count: true,
    }),
    prisma.review.findMany({
      where: { status: 'APPROVED', artwork: { artistId: artist.id } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        rating: true,
        title: true,
        comment: true,
        createdAt: true,
        orderItemId: true,
        user: { select: { firstName: true, lastName: true } },
        artwork: { select: { title: true } },
      },
    }),
  ]);

  res.json({
    status: 'success',
    data: {
      id: artist.id,
      name: artist.displayName,
      slug: artist.slug,
      biography: artist.biography,
      artisticStatement: artist.artisticStatement,
      location: artist.location,
      profileImageUrl: artist.profileImageUrl,
      coverImageUrl: artist.coverImageUrl,
      verified: artist.verificationStatus === 'VERIFIED',
      joinedAt: artist.createdAt,
      rating: {
        average: ratingAggregate._avg.rating,
        count: ratingAggregate._count,
      },
      artworks: artworks.map((artwork) => ({
        id: artwork.id,
        slug: artwork.slug,
        title: artwork.title,
        price: artwork.price,
        currency: artwork.currency,
        image: artwork.images[0] ?? null,
        available: isAvailable(artwork.inventory),
      })),
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        createdAt: review.createdAt,
        verifiedPurchase: Boolean(review.orderItemId),
        reviewerName: `${review.user.firstName} ${review.user.lastName.charAt(0)}.`,
        artworkTitle: review.artwork?.title ?? null,
      })),
    },
  });
}
