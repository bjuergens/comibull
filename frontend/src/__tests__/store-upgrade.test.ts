import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import {
  runUpgrade,
  __DB_VERSION,
  __registerMigrationForTest,
  type ComicRow,
} from '../store';

const TEST_DB = 'comibull-upgrade-test';

async function wipe() {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(TEST_DB);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(wipe);
afterEach(wipe);

describe('runUpgrade', () => {
  it('creates baseline stores on a fresh DB', async () => {
    const d = await openDB(TEST_DB, __DB_VERSION, {
      upgrade(d, oldV, newV, tx) {
        runUpgrade(d as never, oldV, newV ?? __DB_VERSION, tx as never);
      },
    });
    expect([...d.objectStoreNames].sort()).toEqual(
      ['aiCache', 'aiCallLog', 'comics', 'pages'].sort(),
    );
    d.close();
  });

  it('wipes a pre-baseline DB and recreates the baseline', async () => {
    // Seed an old v3 DB with a comics store containing data.
    const old = await openDB(TEST_DB, 3, {
      upgrade(d) {
        d.createObjectStore('comics', { keyPath: 'id' });
      },
    });
    await old.put('comics' as never, {
      id: 1,
      title: 'old',
      source_language: 'de',
      created_at: '2020-01-01',
      page_ids: [],
    } as ComicRow as never);
    old.close();

    // Reopen at the current baseline.
    const d = await openDB(TEST_DB, __DB_VERSION, {
      upgrade(d, oldV, newV, tx) {
        runUpgrade(d as never, oldV, newV ?? __DB_VERSION, tx as never);
      },
    });
    const rows = await d.getAll('comics' as never);
    expect(rows).toEqual([]);
    expect([...d.objectStoreNames].sort()).toEqual(
      ['aiCache', 'aiCallLog', 'comics', 'pages'].sort(),
    );
    d.close();
  });

  it('preserves data through an incremental migration', async () => {
    // Seed at baseline.
    const seed = await openDB(TEST_DB, __DB_VERSION, {
      upgrade(d, oldV, newV, tx) {
        runUpgrade(d as never, oldV, newV ?? __DB_VERSION, tx as never);
      },
    });
    const row: ComicRow = {
      id: 1,
      title: 'kept',
      source_language: 'de',
      created_at: '2024-01-01',
      page_ids: [],
    };
    await seed.put('comics' as never, row as never);
    seed.close();

    // Register a no-op incremental migration at baseline+1 and reopen.
    const targetVersion = __DB_VERSION + 1;
    const cleanup = __registerMigrationForTest(targetVersion, {
      kind: 'incremental',
      apply: () => {
        // intentionally empty — exercises the data-preserving path
      },
    });
    try {
      const d = await openDB(TEST_DB, targetVersion, {
        upgrade(d, oldV, newV, tx) {
          runUpgrade(d as never, oldV, newV ?? targetVersion, tx as never);
        },
      });
      const rows = (await d.getAll('comics' as never)) as ComicRow[];
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('kept');
      d.close();
    } finally {
      cleanup();
    }
  });
});
