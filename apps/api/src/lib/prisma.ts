import { PrismaClient } from '@prisma/client';

/*
    Explainer: PrismaClient is the object our code uses to actually talk
    to the database ("give me all approved reviews for artist-01", etc).
    Creating one of these objects opens a small pool of real connections
    to Postgres — so we want exactly ONE of them shared across the whole
    app, not a new one created every time a file needs it. This file is
    that single shared instance; every controller imports `prisma` from
    here rather than creating its own.
    */
export const prisma = new PrismaClient();
