import { Server, Socket } from 'socket.io';

interface PlaceBidPayload {
  auctionId: string;
  amount: number;
  userId: string;
}

export function registerAuctionSocket(io: Server): void {
  io.on('connection', (socket: Socket) => {
    socket.on('place_bid', async (payload: PlaceBidPayload): Promise<void> => {
      try {
        const { auctionId, amount, userId } = payload;

        io.to(auctionId).emit('bid_placed', {
          auctionId,
          amount,
          userId,
          createdAt: new Date(),
        });
      } catch {
        socket.emit('error', { message: 'Failed to place bid' });
      }
    });
  });
}
