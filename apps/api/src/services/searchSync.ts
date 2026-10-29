import { prisma } from '../config/db.js';
import { elasticClient } from '../config/elasticsearch.js';

export async function syncArtworkToElasticsearch(artworkId: string) {
  const artwork = await prisma.artwork.findUnique({
    where: { id: artworkId },
    include: {
      artist: true,
      images: { where: { isPrimary: true }, take: 1 },
      inventory: { select: { quantity: true, reservedQuantity: true, soldQuantity: true } },
    },
  });

  if (!artwork) return;

  const artistName = artwork.artist?.displayName ?? 'Unknown Artist';
  const primaryImage = artwork.images[0]?.url ?? '';

  await elasticClient.index({
    index: 'artworks',
    id: artwork.id,
    document: {
      id: artwork.id,
      title: artwork.title,
      description: artwork.description,
      price: Number(artwork.price),
      currency: artwork.currency,
      available:
        artwork.status === 'PUBLISHED' &&
        artwork.visibility === 'PUBLIC' &&
        artwork.currency.toUpperCase() === 'USD' &&
        Boolean(
          artwork.inventory &&
            artwork.inventory.quantity - artwork.inventory.reservedQuantity - artwork.inventory.soldQuantity > 0,
        ),
      artistName,
      primaryImage,
      status: artwork.status,
    },
  });
}
