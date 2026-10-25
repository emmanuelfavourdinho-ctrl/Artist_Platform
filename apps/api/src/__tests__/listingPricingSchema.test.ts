import { describe, expect, it } from 'vitest';
import { createArtworkSchema } from '../schemas/studioSchemas.js';
import { createCommissionSchema, createProposalSchema } from '../schemas/commissionSchemas.js';

describe('USD canonical artwork prices', () => {
  const validArtwork = {
    title: 'Blue Study',
    price: '125.50',
    images: [{
      publicId: 'artists/user/artworks/image',
      secureUrl: 'https://res.cloudinary.com/fine-arts/image/upload/image.jpg',
      resourceType: 'image' as const,
      format: 'jpg',
      width: 100,
      height: 100,
      bytes: 100,
    }],
  };

  it('defaults new listings to USD and preserves exact decimal input', () => {
    expect(createArtworkSchema.parse(validArtwork)).toMatchObject({ price: '125.50', currency: 'USD' });
    expect(createArtworkSchema.parse({ ...validArtwork, currency: 'USD' }).currency).toBe('USD');
  });

  it('rejects non-USD listing currencies and prices with unsupported precision/range', () => {
    expect(createArtworkSchema.safeParse({ ...validArtwork, currency: 'XAF' }).success).toBe(false);
    expect(createArtworkSchema.safeParse({ ...validArtwork, price: '12.345' }).success).toBe(false);
    expect(createArtworkSchema.safeParse({ ...validArtwork, price: '10000000000.00' }).success).toBe(false);
  });
});

describe('supported commission currencies', () => {
  it('normalizes explicitly supported currency codes and rejects unknown codes', () => {
    const request = createCommissionSchema.safeParse({
      artistId: '00000000-0000-4000-8000-000000000000',
      title: 'Portrait',
      description: 'A detailed portrait for a collector.',
      currency: 'xaf',
    });
    expect(request.success && request.data.currency).toBe('XAF');
    expect(createProposalSchema.safeParse({ price: 100, currency: 'XYZ' }).success).toBe(false);
  });
});
