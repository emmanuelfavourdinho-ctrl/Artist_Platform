import { prisma } from '../src/lib/prisma.js';

async function main(): Promise<void> {
  const email = process.argv[2];

  if (!email) {
    console.error('Usage: npm run create-admin -- someone@example.com');
    console.error('(the "--" is required so npm passes the email through to the script)');
    process.exitCode = 1;
    return;
  }

  // Deliberately does NOT create a new User — admin status is granted
  // to an existing real account, never a phantom one. The person must
  // have already signed up through the normal Firebase flow first;
  // this script only ever adds a role on top of that.
  const user = await prisma.user.findUnique({
    where: { email },
    include: { roles: { include: { role: true } } },
  });

  if (!user) {
    console.error(`No user found with email "${email}".`);
    console.error(
      'They need to sign up through the app first — this script only promotes existing accounts.',
    );
    process.exitCode = 1;
    return;
  }

  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });

  if (!adminRole) {
    console.error('No "ADMIN" role exists in the database yet.');
    console.error('Run `npm run db:seed` first, then try this again.');
    process.exitCode = 1;
    return;
  }

  const alreadyAdmin = user.roles.some((ur) => ur.role.name === 'ADMIN');
  if (alreadyAdmin) {
    console.log(`${email} is already an admin. Nothing to do.`);
    return;
  }

  await prisma.userRole.create({
    data: { userId: user.id, roleId: adminRole.id },
  });

  console.log(`✅ ${email} is now an admin.`);
  console.log(
    'They may need to refresh the page or log out/in for the role to take effect in their session.',
  );
}

main()
  .catch((err) => {
    console.error('Failed to create admin:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
