/**
 * Process-wide async mutex keyed by string (e.g. repositoryId:symbolId).
 * Serializes critical sections that share a key; different keys run in parallel.
 */
export class KeyedAsyncMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prev.then(() => gate);
    this.tails.set(key, tail);

    await prev.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    }
  }

  /** Test helper — number of keys with a pending chain. */
  pendingKeyCount(): number {
    return this.tails.size;
  }
}

/** Shared across HTTP request-scoped DocumentsService instances. */
export const symbolDocumentLinkMutex = new KeyedAsyncMutex();

/** Serialize MT document create-or-reuse by absolute content URL. */
export const mtDocumentUrlCreateMutex = new KeyedAsyncMutex();

export function symbolDocumentLockKey(repositoryId: string, symbolId: string): string {
  return `${repositoryId}:${symbolId}`;
}

export function mtDocumentUrlLockKey(repositoryId: string, absoluteUrl: string): string {
  return `${repositoryId}:url:${absoluteUrl}`;
}
