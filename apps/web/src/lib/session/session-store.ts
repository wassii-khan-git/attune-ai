const ACCESS_EXPIRY_KEY = 'attune.session.accessExpiresAt';
const LAST_ACTIVITY_KEY = 'attune.session.lastActivityAt';

/**
 * The little the browser remembers about a session, shared by every tab.
 *
 * It holds two timestamps and nothing else: when the access token expires and
 * when the user was last active. The tokens themselves are httpOnly cookies
 * that script cannot read, and no user or clinical data is ever put here.
 */
export type SessionStore = {
  getAccessExpiry: () => number | null;
  setAccessExpiry: (epochMs: number) => void;
  getLastActivity: () => number | null;
  setLastActivity: (epochMs: number) => void;
  /** Forgets the session. Other tabs see this and sign out too. */
  clear: () => void;
  /** Calls `listener` when another tab clears the session. Returns an unsubscribe function. */
  onClearedElsewhere: (listener: () => void) => () => void;
};

type StorageEvents = Pick<Window, 'addEventListener' | 'removeEventListener'>;

function readNumber(storage: Storage, key: string): number | null {
  try {
    const raw = storage.getItem(key);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    // Storage can be blocked (private mode, strict settings). The app then works per tab.
    return null;
  }
}

function write(storage: Storage, key: string, value: number | null): void {
  try {
    if (value === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, String(value));
    }
  } catch {
    // See readNumber.
  }
}

export function createSessionStore(storage: Storage, events?: StorageEvents): SessionStore {
  return {
    getAccessExpiry: () => readNumber(storage, ACCESS_EXPIRY_KEY),
    setAccessExpiry: (epochMs) => {
      write(storage, ACCESS_EXPIRY_KEY, epochMs);
    },
    getLastActivity: () => readNumber(storage, LAST_ACTIVITY_KEY),
    setLastActivity: (epochMs) => {
      write(storage, LAST_ACTIVITY_KEY, epochMs);
    },
    clear: () => {
      write(storage, ACCESS_EXPIRY_KEY, null);
      write(storage, LAST_ACTIVITY_KEY, null);
    },
    onClearedElsewhere: (listener) => {
      if (events === undefined) {
        return () => undefined;
      }
      // `storage` events fire only in the other tabs, never in the one that made the change.
      const handle = (event: StorageEvent) => {
        if (event.key === ACCESS_EXPIRY_KEY && event.newValue === null) {
          listener();
        }
      };
      events.addEventListener('storage', handle);
      return () => {
        events.removeEventListener('storage', handle);
      };
    },
  };
}
