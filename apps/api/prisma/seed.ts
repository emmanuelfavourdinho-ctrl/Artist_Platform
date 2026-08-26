import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth.js';

const prisma = new PrismaClient();

// Same password on every seeded account — fine for a demo seed script,
// never acceptable for real user data.
const DEMO_PASSWORD = 'DemoPass123!';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main() {
  console.log('Seeding roles...');
  const [buyerRole, artistRole, adminRole] = await Promise.all([
    prisma.role.upsert({
      where: { name: 'BUYER' },
      update: {},
      create: { name: 'BUYER', description: 'Can browse and purchase artwork' },
    }),
    prisma.role.upsert({
      where: { name: 'ARTIST' },
      update: {},
      create: { name: 'ARTIST', description: 'Can create and sell artwork' },
    }),
    prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN', description: 'Platform administrator' },
    }),
  ]);

  console.log('Seeding taxonomy...');
  const categoryNames = ['Painting', 'Photography', 'Sculpture', 'Digital Art'];
  const categories = await Promise.all(
    categoryNames.map((name) =>
      prisma.category.upsert({
        where: { slug: slugify(name) },
        update: {},
        create: { name, slug: slugify(name) },
      }),
    ),
  );

  const mediumNames = ['Oil on canvas', 'Acrylic', 'Digital', 'Bronze'];
  const mediums = await Promise.all(
    mediumNames.map((name) =>
      prisma.medium.upsert({
        where: { slug: slugify(name) },
        update: {},
        create: { name, slug: slugify(name) },
      }),
    ),
  );

  const styleNames = ['Abstract', 'Realism', 'Minimalist'];
  const styles = await Promise.all(
    styleNames.map((name) =>
      prisma.style.upsert({
        where: { slug: slugify(name) },
        update: {},
        create: { name, slug: slugify(name) },
      }),
    ),
  );

  const themeNames = ['Portrait', 'Landscape', 'Urban'];
  const themes = await Promise.all(
    themeNames.map((name) =>
      prisma.theme.upsert({
        where: { slug: slugify(name) },
        update: {},
        create: { name, slug: slugify(name) },
      }),
    ),
  );

  console.log('Seeding admin + buyer accounts...');
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.art' },
    update: {},
    create: {
      email: 'admin@demo.art',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      status: 'ACTIVE',
      roles: { create: [{ roleId: adminRole.id }] },
    },
  });

  const buyer = await prisma.user.upsert({
    where: { email: 'buyer@demo.art' },
    update: {},
    create: {
      email: 'buyer@demo.art',
      passwordHash,
      firstName: 'Blessing',
      lastName: 'Okoye',
      status: 'ACTIVE',
      roles: { create: [{ roleId: buyerRole.id }] },
    },
  });

  console.log('Seeding artists...');
  const artistSeeds = [
    {
      email: 'amara@demo.art',
      firstName: 'Amara',
      lastName: 'Nwosu',
      displayName: 'Amara N.',
      bio: 'Lagos-based painter working in oil and acrylic, drawn to color and coastal light.',
    },
    {
      email: 'kwame@demo.art',
      firstName: 'Kwame',
      lastName: 'Boateng',
      displayName: 'Kwame B.',
      bio: 'Sculptor working primarily in reclaimed bronze and wood.',
    },
    {
      email: 'zara@demo.art',
      firstName: 'Zara',
      lastName: 'Idris',
      displayName: 'Zara I.',
      bio: 'Digital and photographic artist exploring urban Nigerian life.',
    },
  ];

  const artists = [];
  for (const seed of artistSeeds) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: {},
      create: {
        email: seed.email,
        passwordHash,
        firstName: seed.firstName,
        lastName: seed.lastName,
        status: 'ACTIVE',
        roles: { create: [{ roleId: artistRole.id }] },
      },
    });

    const profile = await prisma.artistProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        displayName: seed.displayName,
        slug: slugify(seed.displayName),
        biography: seed.bio,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
      },
    });

    artists.push(profile);
  }

  console.log('Seeding artworks...');
  // Placeholder photos — swap these for real Cloudinary secure_urls once
  // real artwork images exist. Used here only so the demo has real,
  // working images without needing a Cloudinary account set up under
  // time pressure.
  const PLACEHOLDER_IMAGES = [
    'https://picsum.photos/seed/artwork1/1200/1500',
    'https://picsum.photos/seed/artwork2/1200/1500',
    'https://picsum.photos/seed/artwork3/1200/1500',
    'https://picsum.photos/seed/artwork4/1200/1500',
    'https://picsum.photos/seed/artwork5/1200/1500',
    'https://picsum.photos/seed/artwork6/1200/1500',
  ];

  const artworkSeeds = [
    {
      title: 'Sunset Over Lagos',
      price: 450,
      artistIndex: 0,
      categoryIndex: 0,
      mediumIndex: 0,
      styleIndex: 1,
      themeIndex: 1,
      description: 'An oil painting capturing golden hour over the lagoon.',
      width: 60,
      height: 80,
      yearCreated: 2025,
    },
    {
      title: 'Quiet Harbor',
      price: 320,
      artistIndex: 0,
      categoryIndex: 0,
      mediumIndex: 1,
      styleIndex: 0,
      themeIndex: 1,
      description: 'Acrylic study of stillness at dawn.',
      width: 45,
      height: 60,
      yearCreated: 2024,
    },
    {
      title: 'Bronze Ancestor',
      price: 1200,
      artistIndex: 1,
      categoryIndex: 2,
      mediumIndex: 3,
      styleIndex: 1,
      themeIndex: 1,
      description: 'A bronze figure cast from reclaimed metal.',
      width: 30,
      height: 55,
      yearCreated: 2023,
    },
    {
      title: 'Standing Watch',
      price: 980,
      artistIndex: 1,
      categoryIndex: 2,
      mediumIndex: 3,
      styleIndex: 1,
      themeIndex: 2,
      description: 'Bronze sculpture exploring vigilance and memory.',
      width: 25,
      height: 70,
      yearCreated: 2025,
    },
    {
      title: 'Marina District, Night',
      price: 275,
      artistIndex: 2,
      categoryIndex: 1,
      mediumIndex: 2,
      styleIndex: 2,
      themeIndex: 2,
      description: 'Long-exposure photograph of the city after dark.',
      width: 90,
      height: 60,
      yearCreated: 2026,
    },
    {
      title: 'Faces of the Market',
      price: 210,
      artistIndex: 2,
      categoryIndex: 3,
      mediumIndex: 2,
      styleIndex: 1,
      themeIndex: 0,
      description: 'Digital portrait series inspired by market vendors.',
      width: 50,
      height: 50,
      yearCreated: 2026,
    },
  ];

  for (let i = 0; i < artworkSeeds.length; i += 1) {
    const seed = artworkSeeds[i]!;
    const artist = artists[seed.artistIndex]!;
    const slug = slugify(seed.title);

    const artwork = await prisma.artwork.upsert({
      where: { slug },
      update: {},
      create: {
        artistId: artist.id,
        title: seed.title,
        slug,
        description: seed.description,
        price: seed.price,
        currency: 'USD',
        yearCreated: seed.yearCreated,
        width: seed.width,
        height: seed.height,
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        publishedAt: new Date(),
        images: {
          create: [
            {
              url: PLACEHOLDER_IMAGES[i % PLACEHOLDER_IMAGES.length]!,
              altText: seed.title,
              isPrimary: true,
              position: 0,
            },
          ],
        },
        categories: { create: [{ categoryId: categories[seed.categoryIndex]!.id }] },
        mediums: { create: [{ mediumId: mediums[seed.mediumIndex]!.id }] },
        styles: { create: [{ styleId: styles[seed.styleIndex]!.id }] },
        themes: { create: [{ themeId: themes[seed.themeIndex]!.id }] },
        inventory: { create: { quantity: 1, reservedQuantity: 0, soldQuantity: 0 } },
      },
    });

    // One review per artwork, alternating pending/approved so the admin
    // moderation demo has something real to act on. Guarded with a
    // findFirst check (rather than a raw create) so this script stays
    // safe to run multiple times without piling up duplicate reviews —
    // mirrors the app's own duplicate-review rule in reviewControllers.ts.
    const existingReview = await prisma.review.findFirst({
      where: { userId: buyer.id, artworkId: artwork.id },
    });
    if (!existingReview) {
      await prisma.review.create({
        data: {
          userId: buyer.id,
          artworkId: artwork.id,
          rating: 4 + (i % 2),
          comment: `Beautiful piece, exactly as described. ${seed.title} really stands out in person.`,
          status: i % 2 === 0 ? 'APPROVED' : 'PENDING',
        },
      });
    }
  }

  console.log('\nSeed complete.\n');
  console.log('Demo accounts (all share the same password):');
  console.log(`  Admin: ${admin.email}`);
  console.log(`  Buyer: ${buyer.email}`);
  console.log(`  Password: ${DEMO_PASSWORD}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
