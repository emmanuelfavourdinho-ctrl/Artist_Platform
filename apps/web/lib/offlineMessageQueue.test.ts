import { describe, expect, it } from 'vitest';
import { createOfflineMessageQueue, type OfflineMessageQueueStorage, type QueuedTextMessage } from './offlineMessageQueue';

class MemoryQueueStorage implements OfflineMessageQueueStorage {
  private readonly messages = new Map<string, QueuedTextMessage>();
  async getAll(accountId: string) { return [...this.messages.values()].filter((message) => message.accountId === accountId); }
  async put(message: QueuedTextMessage) { this.messages.set(message.id, message); }
  async delete(id: string) { this.messages.delete(id); }
  async clear() { this.messages.clear(); }
  async clearExcept(accountId: string) {
    for (const [id, message] of this.messages) if (message.accountId !== accountId) this.messages.delete(id);
  }
}

const queuedMessage = (overrides: Partial<QueuedTextMessage> = {}): QueuedTextMessage => ({
  id: 'stable-message-id', accountId: 'firebase-user-a', conversationId: 'conversation-a',
  body: 'Hello while offline', createdAt: '2026-10-26T10:00:00.000Z', state: 'waiting',
  retryOnReconnect: true, failureReason: null, ...overrides,
});

describe('offline text message queue', () => {
  it('persists a stable UUID and scopes reads to the signed-in account', async () => {
    const storage = new MemoryQueueStorage();
    const firstTab = createOfflineMessageQueue(storage);
    const reopenedTab = createOfflineMessageQueue(storage);
    await firstTab.save(queuedMessage());
    await firstTab.save(queuedMessage({ id: 'message-for-user-b', accountId: 'firebase-user-b' }));

    expect(await reopenedTab.list('firebase-user-a')).toEqual([queuedMessage()]);
    expect(await reopenedTab.list('firebase-user-b')).toHaveLength(1);
  });

  it('updates a queue item idempotently, records retry failure, and removes it after acknowledgement', async () => {
    const queue = createOfflineMessageQueue(new MemoryQueueStorage());
    await queue.save(queuedMessage({ state: 'sending' }));
    await queue.save(queuedMessage({ state: 'failed', retryOnReconnect: false, failureReason: 'Conversation is no longer available.' }));
    expect(await queue.list('firebase-user-a')).toEqual([
      queuedMessage({ state: 'failed', retryOnReconnect: false, failureReason: 'Conversation is no longer available.' }),
    ]);
    await queue.acknowledge('stable-message-id');
    expect(await queue.list('firebase-user-a')).toEqual([]);
  });

  it('clears all queued drafts on logout and other accounts on account switch', async () => {
    const queue = createOfflineMessageQueue(new MemoryQueueStorage());
    await queue.save(queuedMessage());
    await queue.save(queuedMessage({ id: 'user-b-message', accountId: 'firebase-user-b' }));
    await queue.clearOtherAccounts('firebase-user-b');
    expect(await queue.list('firebase-user-a')).toEqual([]);
    expect(await queue.list('firebase-user-b')).toHaveLength(1);
    await queue.clear();
    expect(await queue.list('firebase-user-b')).toEqual([]);
  });
});
