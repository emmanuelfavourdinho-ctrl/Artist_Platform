export type OfflineMessageState = 'waiting' | 'sending' | 'failed';

export interface QueuedTextMessage {
  id: string;
  accountId: string;
  conversationId: string;
  body: string;
  createdAt: string;
  state: OfflineMessageState;
  retryOnReconnect: boolean;
  failureReason: string | null;
}

export interface OfflineMessageQueueStorage {
  getAll(accountId: string): Promise<QueuedTextMessage[]>;
  put(message: QueuedTextMessage): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  clearExcept(accountId: string): Promise<void>;
}

const DATABASE_NAME = 'fine-arts-offline-v1';
const DATABASE_VERSION = 1;
const STORE_NAME = 'text-message-queue';
const ACCOUNT_INDEX = 'accountId';

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Offline message storage is unavailable in this browser.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex(ACCOUNT_INDEX, 'accountId', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Offline message storage could not be opened.'));
    request.onblocked = () => reject(new Error('Offline message storage is busy in another tab.'));
  });
}

class IndexedDbQueueStorage implements OfflineMessageQueueStorage {
  async getAll(accountId: string) {
    return this.withStore('readonly', (store) => store.index(ACCOUNT_INDEX).getAll(accountId));
  }

  async put(message: QueuedTextMessage) {
    await this.withStore('readwrite', (store) => store.put(message));
  }

  async delete(id: string) {
    await this.withStore('readwrite', (store) => store.delete(id));
  }

  async clear() {
    await this.withStore('readwrite', (store) => store.clear());
  }

  async clearExcept(accountId: string) {
    await this.withStore('readwrite', (store) => {
      const request = store.getAll();
      request.addEventListener('success', () => {
        for (const item of request.result as QueuedTextMessage[]) {
          if (item.accountId !== accountId) store.delete(item.id);
        }
      });
      return request;
    });
  }

  private async withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await openDatabase();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result: T;
      try {
        const request = operation(store);
        request.addEventListener('success', () => { result = request.result; });
        request.addEventListener('error', () => reject(request.error ?? new Error('Offline message storage request failed.')));
      } catch (error) {
        database.close();
        reject(error);
        return;
      }
      transaction.oncomplete = () => { database.close(); resolve(result!); };
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Offline message storage transaction failed.')); };
      transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('Offline message storage transaction was cancelled.')); };
    });
  }
}

export function createOfflineMessageQueue(storage: OfflineMessageQueueStorage = new IndexedDbQueueStorage()) {
  return {
    list: (accountId: string) => storage.getAll(accountId),
    save: (message: QueuedTextMessage) => storage.put(message),
    acknowledge: (id: string) => storage.delete(id),
    clear: () => storage.clear(),
    clearOtherAccounts: (accountId: string) => storage.clearExcept(accountId),
  };
}

const offlineMessageQueue = createOfflineMessageQueue();
export const listQueuedMessages = offlineMessageQueue.list;
export const saveQueuedMessage = offlineMessageQueue.save;
export const acknowledgeQueuedMessage = offlineMessageQueue.acknowledge;
export const clearQueuedMessages = offlineMessageQueue.clear;
export const clearQueueForOtherAccounts = offlineMessageQueue.clearOtherAccounts;
