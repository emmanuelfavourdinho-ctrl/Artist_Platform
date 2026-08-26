import { hashPassword } from '../src/lib/auth.js';
import { prisma } from '../src/lib/prisma.js';

/*
  Explainer: this is a one-off script — you run it manually, from your
  own terminal, when you personally decide a new admin account should
  exist. It is NOT a route the website exposes to visitors, and there is
  deliberately no "sign up as admin" button anywhere on the site. That's
  the whole security model for how someone becomes an admin: only
  someone with direct access to this codebase and this database can
  create one, ever.

  Usage:  npm run create-admin -- you@example.com "a genuinely strong password"
  (everything after the -- gets passed through as arguments to this script)
*/
async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: npm run create-admin -- <email> <password>');
    process.exitCode = 1;
    return;
  }

  if (password.length < 12) {
    console.error('Password must be at least 12 characters long.');
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);

  // `upsert` = "update if it already exists, otherwise create it" — so
  // running this script again for the same email safely resets that
  // admin's password instead of erroring out.
  const admin = await prisma.admin.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });

  console.log(`Admin account ready: ${admin.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
