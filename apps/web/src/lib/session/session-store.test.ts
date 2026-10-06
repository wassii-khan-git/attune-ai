import { describe, expect, it, vi } from 'vitest';

import { createSessionStore } from './session-store';
import { createMemoryStorage } from './testing';

describe('session store', () => {
  it('remembers the two timestamps', () => {
    const store = createSessionStore(createMemoryStorage());

    store.setAccessExpiry(1_000);
    store.setLastActivity(2_000);

    expect(store.getAccessExpiry()).toBe(1_000);
    expect(store.getLastActivity()).toBe(2_000);
  });

  it('starts empty and is empty again after clear', () => {
    const store = createSessionStore(createMemoryStorage());
    expect(store.getAccessExpiry()).toBeNull();

    store.setAccessExpiry(1_000);
    store.setLastActivity(2_000);
    store.clear();

    expect(store.getAccessExpiry()).toBeNull();
    expect(store.getLastActivity()).toBeNull();
  });

  it('stores nothing but those two numbers', () => {
    const storage = createMemoryStorage();
    const store = createSessionStore(storage);

    store.setAccessExpiry(1_000);
    store.setLastActivity(2_000);

    expect(storage.length).toBe(2);
    expect([storage.getItem(storage.key(0) ?? ''), storage.getItem(storage.key(1) ?? '')]).toEqual([
      '1000',
      '2000',
    ]);
  });

  it('ignores a value that is not a number', () => {
    const storage = createMemoryStorage();
    storage.setItem('attune.session.accessExpiresAt', 'not-a-number');

    expect(createSessionStore(storage).getAccessExpiry()).toBeNull();
  });

  it('keeps working when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const store = createSessionStore(blocked);

    expect(() => {
      store.setAccessExpiry(1);
      store.clear();
    }).not.toThrow();
    expect(store.getAccessExpiry()).toBeNull();
  });

  it('tells this tab when another tab ends the session, and only then', () => {
    const events = new EventTarget();
    const store = createSessionStore(createMemoryStorage(), events);
    const listener = vi.fn();
    const stop = store.onClearedElsewhere(listener);
    const storageEvent = (key: string, newValue: string | null) =>
      Object.assign(new Event('storage'), { key, newValue });

    events.dispatchEvent(storageEvent('attune.session.accessExpiresAt', '123'));
    events.dispatchEvent(storageEvent('something.else', null));
    expect(listener).not.toHaveBeenCalled();

    events.dispatchEvent(storageEvent('attune.session.accessExpiresAt', null));
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    events.dispatchEvent(storageEvent('attune.session.accessExpiresAt', null));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
