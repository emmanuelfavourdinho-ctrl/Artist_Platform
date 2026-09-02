import { Request, Response, NextFunction } from 'express';

// TODO: Auction/Bid models don't exist yet in schema.prisma.
// Re-implement once they're added and migrated — see chat for the
// suggested Prisma model shape. Stubbed to unblock the build.
export async function getAuctionDetails(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    return res.status(501).json({ message: 'Auctions are not yet available' });
  } catch (error) {
    return next(error);
  }
}
