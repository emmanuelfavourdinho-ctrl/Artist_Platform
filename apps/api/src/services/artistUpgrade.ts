import { prisma } from '../lib/prisma.js';

export async function upgradeBuyerToArtist(
  userId: string,
  profileData: {
    displayName: string;
    slug: string;
    biography?: string;
  },
) {
  return await prisma.$transaction(async (tx) => {
    // 1. Check if user already has an ArtistProfile
    const existingProfile = await tx.artistProfile.findUnique({ where: { userId } });
    if (existingProfile) {
      return existingProfile;
    }

    // 2. Create the ArtistProfile linked to the user
    const artistProfile = await tx.artistProfile.create({
      data: {
        userId,
        displayName: profileData.displayName,
        slug: profileData.slug,
        biography: profileData.biography,
      },
    });

    // 3. Find the ARTIST role ID from the database
    const artistRole = await tx.role.findUnique({ where: { name: 'ARTIST' } });
    if (!artistRole) {
      throw new Error('ARTIST role not found in database. Run your seed script!');
    }

    // 4. Attach the ARTIST role to the UserRole join table
    await tx.userRole.upsert({
      where: {
        userId_roleId: { userId, roleId: artistRole.id },
      },
      create: { userId, roleId: artistRole.id },
      update: {},
    });

    return artistProfile;
  });
}
