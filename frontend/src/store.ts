// Thin IndexedDB wrapper built on `idb`. One database, four stores:
//
//   comics:      ComicRow keyed by id
//   pages:       PageRow keyed by id
//   aiCache:     CacheEntry keyed by call_hash (content-addressed responses)
//   aiCallLog:   CallLogEntry keyed by auto-id — ring buffer trimmed in code

import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import type {
  AiCallType,
  AiProvider,
  PageStatus,
  Region,
  SourceLanguage,
} from './shared-types';

export interface ComicRow {
  id: number;
  title: string;
  source_language: SourceLanguage;
  created_at: string;
  page_ids: number[];
}

export interface PageRow {
  id: number;
  comic_id: number;
  // Sort key for display order. Internal — not shown to the user. Gaps from
  // deletes are fine; addPages just picks max(existing) + 1.
  display_order: number;
  image: Blob;
  regions: Region[] | null;
  status: PageStatus;
  error_message: string | null;
}

export interface CacheEntry {
  call_hash: string;
  call_type: AiCallType;
  response_json: unknown;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export interface CallLogEntry {
  id?: number;
  call_type: AiCallType;
  // Optional for forwards compat with rows logged before the multi-provider
  // refactor. Readers should treat absent as 'anthropic'.
  provider?: AiProvider;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_hit: boolean;
  page_id: number | null;
  created_at: string;
}

interface Schema extends DBSchema {
  comics: { key: number; value: ComicRow };
  pages: { key: number; value: PageRow };
  aiCache: { key: string; value: CacheEntry };
  aiCallLog: { key: number; value: CallLogEntry };
}

const DB_NAME = 'comibull';
const CALL_LOG_MAX = 500;

// ─── Schema upgrades ────────────────────────────────────────────────────
//
// To bump the schema:
//   1. Add an entry to `migrations` keyed by the new target version.
//      - `incremental` preserves existing data. Use for additive changes
//        (new store, new index, nullable field).
//      - `wipe` drops every store and recreates the baseline. Use when the
//        change is messy enough that a real migration isn't worth writing.
//   2. Bump DB_VERSION to that key.
//   3. Extend the upgrade test in __tests__/store-upgrade.test.ts.
//
// Callers always see the current schema. Do NOT add backwards-compat shims
// (`if (row.oldField) ...`) in business code — handle it in the migration
// or wipe.
//
// Databases older than BASELINE_VERSION always wipe; we don't carry old
// migration paths forward.

type UpgradeTx = IDBPTransaction<Schema, StoreNames<Schema>[], 'versionchange'>;

type Migration =
  | { kind: 'incremental'; apply: (db: IDBPDatabase<Schema>, tx: UpgradeTx) => void }
  | { kind: 'wipe'; reason: string };

const BASELINE_VERSION = 5;
const DB_VERSION = 5;

const migrations: Record<number, Migration> = {
  // Future bumps go here, e.g.:
  //   6: { kind: 'incremental', apply: (db) => { db.createObjectStore('foo', { keyPath: 'id' }); } },
  //   7: { kind: 'wipe', reason: 'pages.regions reshape' },
};

function createBaseline(db: IDBPDatabase<Schema>): void {
  db.createObjectStore('comics', { keyPath: 'id' });
  db.createObjectStore('pages', { keyPath: 'id' });
  db.createObjectStore('aiCache', { keyPath: 'call_hash' });
  db.createObjectStore('aiCallLog', { keyPath: 'id', autoIncrement: true });
}

function wipeAllStores(db: IDBPDatabase<Schema>): void {
  for (const name of Array.from(db.objectStoreNames)) {
    db.deleteObjectStore(name);
  }
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export interface MigrationNotice {
  oldVersion: number;
  newVersion: number;
  wiped: boolean;
}

let pendingMigrationNotice: MigrationNotice | null = null;
let migrationNoticeConsumed = false;

export function runUpgrade(
  d: IDBPDatabase<Schema>,
  oldVersion: number,
  newVersion: number,
  tx: UpgradeTx,
): void {
  if (oldVersion === 0) {
    createBaseline(d);
    return;
  }
  let wiped = false;
  if (oldVersion < BASELINE_VERSION) {
    console.warn(`⚠️ comibull: pre-baseline schema v${oldVersion} → wiping IndexedDB.`);
    wipeAllStores(d);
    createBaseline(d);
    wiped = true;
  }
  for (let v = Math.max(oldVersion, BASELINE_VERSION) + 1; v <= newVersion; v++) {
    const m = migrations[v];
    if (!m) throw new Error(`no migration registered for v${v}`);
    if (m.kind === 'wipe') {
      console.warn(`⚠️ comibull: v${v} wipe (${m.reason}).`);
      wipeAllStores(d);
      createBaseline(d);
      wiped = true;
    } else {
      m.apply(d, tx);
    }
  }
  pendingMigrationNotice = { oldVersion, newVersion, wiped };
}

export function db(): Promise<IDBPDatabase<Schema>> {
  if (dbPromise === null) {
    dbPromise = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(d, oldVersion, newVersion, tx) {
        runUpgrade(d, oldVersion, newVersion ?? DB_VERSION, tx);
      },
    });
  }
  return dbPromise;
}

export const __DB_NAME = DB_NAME;
export const __DB_VERSION = DB_VERSION;
export const __BASELINE_VERSION = BASELINE_VERSION;

// Test-only: register a migration; returns a cleanup that removes it.
export function __registerMigrationForTest(version: number, m: Migration): () => void {
  migrations[version] = m;
  return () => {
    delete migrations[version];
  };
}

export function consumeMigrationNotice(): MigrationNotice | null {
  if (migrationNoticeConsumed) return null;
  migrationNoticeConsumed = true;
  return pendingMigrationNotice;
}

// ─── IDs ────────────────────────────────────────────────────────────────
// Postgres handed out monotonic ints; we do the same in-browser so URLs
// like /comics/42 keep working and existing page-number semantics survive.
// Incremented by reading the current max and adding 1 — fine at 10–100
// comics per user, and we have zero concurrent writers.

async function nextId<S extends 'comics' | 'pages'>(store: S): Promise<number> {
  const d = await db();
  const keys = await d.getAllKeys(store);
  let max = 0;
  for (const k of keys) {
    if (typeof k === 'number' && k > max) max = k;
  }
  return max + 1;
}

// ─── Comic CRUD ─────────────────────────────────────────────────────────

export async function listComics(): Promise<ComicRow[]> {
  const d = await db();
  const rows = await d.getAll('comics');
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getComic(id: number): Promise<ComicRow | undefined> {
  const d = await db();
  return d.get('comics', id);
}

export async function createComic(title: string, source_language: SourceLanguage): Promise<ComicRow> {
  const d = await db();
  const id = await nextId('comics');
  const row: ComicRow = {
    id,
    title,
    source_language,
    created_at: new Date().toISOString(),
    page_ids: [],
  };
  await d.put('comics', row);
  return row;
}

export async function updateComic(id: number, patch: Partial<Pick<ComicRow, 'title' | 'source_language'>>): Promise<void> {
  const d = await db();
  const row = await d.get('comics', id);
  if (!row) throw new Error(`comic ${id} not found`);
  await d.put('comics', { ...row, ...patch });
}

export async function deleteComic(id: number): Promise<void> {
  const d = await db();
  const comic = await d.get('comics', id);
  if (!comic) return;
  const tx = d.transaction(['comics', 'pages'], 'readwrite');
  for (const pid of comic.page_ids) await tx.objectStore('pages').delete(pid);
  await tx.objectStore('comics').delete(id);
  await tx.done;
}

// ─── Page CRUD ──────────────────────────────────────────────────────────

export async function listPages(comic_id: number): Promise<PageRow[]> {
  const d = await db();
  const comic = await d.get('comics', comic_id);
  if (!comic) return [];
  const pages: PageRow[] = [];
  for (const pid of comic.page_ids) {
    const p = await d.get('pages', pid);
    if (p) pages.push(p);
  }
  return pages.sort((a, b) => a.display_order - b.display_order);
}

export async function getPage(page_id: number): Promise<PageRow | undefined> {
  const d = await db();
  return d.get('pages', page_id);
}

export async function addPages(comic_id: number, images: Blob[]): Promise<void> {
  const d = await db();
  const comic = await d.get('comics', comic_id);
  if (!comic) throw new Error(`comic ${comic_id} not found`);

  // Gaps from deletes are fine — we never renumber. Pick max(existing) + 1.
  let maxOrder = 0;
  for (const pid of comic.page_ids) {
    const p = await d.get('pages', pid);
    if (p && p.display_order > maxOrder) maxOrder = p.display_order;
  }
  const firstId = await nextId('pages');
  const newIds = images.map((_, i) => firstId + i);

  const tx = d.transaction(['comics', 'pages'], 'readwrite');
  for (let i = 0; i < images.length; i++) {
    await tx.objectStore('pages').add({
      id: newIds[i]!,
      comic_id,
      display_order: maxOrder + 1 + i,
      image: images[i]!,
      regions: null,
      status: 'idle',
      error_message: null,
    });
  }
  await tx.objectStore('comics').put({ ...comic, page_ids: [...comic.page_ids, ...newIds] });
  await tx.done;
}

export async function updatePage(page_id: number, patch: Partial<PageRow>): Promise<void> {
  const d = await db();
  const row = await d.get('pages', page_id);
  if (!row) throw new Error(`page ${page_id} not found`);
  await d.put('pages', { ...row, ...patch });
}

export async function deletePage(comic_id: number, page_id: number): Promise<void> {
  const d = await db();
  const comic = await d.get('comics', comic_id);
  if (!comic) return;
  const tx = d.transaction(['comics', 'pages'], 'readwrite');
  await tx.objectStore('pages').delete(page_id);
  await tx.objectStore('comics').put({
    ...comic,
    page_ids: comic.page_ids.filter(id => id !== page_id),
  });
  await tx.done;
}

export async function swapPagePositions(comic_id: number, page_id_a: number, page_id_b: number): Promise<void> {
  const d = await db();
  const tx = d.transaction('pages', 'readwrite');
  const a = await tx.store.get(page_id_a);
  const b = await tx.store.get(page_id_b);
  if (!a) throw new Error(`page ${page_id_a} not found`);
  if (!b) throw new Error(`page ${page_id_b} not found`);
  if (a.comic_id !== comic_id || b.comic_id !== comic_id) {
    throw new Error(`pages ${page_id_a}, ${page_id_b} not both in comic ${comic_id}`);
  }
  await tx.store.put({ ...a, display_order: b.display_order });
  await tx.store.put({ ...b, display_order: a.display_order });
  await tx.done;
}

// ─── AI cache (content-addressed) ────────────────────────────────────────

export async function cacheLookup(call_hash: string): Promise<CacheEntry | undefined> {
  const d = await db();
  return d.get('aiCache', call_hash);
}

export async function cacheStore(entry: CacheEntry): Promise<void> {
  const d = await db();
  await d.put('aiCache', entry);
}

export async function cacheClear(): Promise<void> {
  const d = await db();
  await d.clear('aiCache');
}

// ─── Call log (ring buffer) ──────────────────────────────────────────────

export async function logCall(entry: Omit<CallLogEntry, 'id'>): Promise<void> {
  const d = await db();
  await d.add('aiCallLog', entry);
  const count = await d.count('aiCallLog');
  if (count > CALL_LOG_MAX) {
    // Drop oldest rows (lowest auto-ids).
    const tx = d.transaction('aiCallLog', 'readwrite');
    let cursor = await tx.store.openCursor();
    let toDelete = count - CALL_LOG_MAX;
    while (cursor && toDelete > 0) {
      await cursor.delete();
      toDelete -= 1;
      cursor = await cursor.continue();
    }
    await tx.done;
  }
}

export async function listCallLog(limit = 100): Promise<CallLogEntry[]> {
  const d = await db();
  const all = await d.getAll('aiCallLog');
  return all.slice(-limit).reverse();
}

export async function clearAll(): Promise<void> {
  const d = await db();
  const tx = d.transaction(['comics', 'pages', 'aiCache', 'aiCallLog'], 'readwrite');
  await tx.objectStore('comics').clear();
  await tx.objectStore('pages').clear();
  await tx.objectStore('aiCache').clear();
  await tx.objectStore('aiCallLog').clear();
  await tx.done;
}

export async function storageStats(): Promise<{ comics: number; pages: number; cache: number; logs: number; bytes: number }> {
  const d = await db();
  const [comics, pages, cache, logs] = await Promise.all([
    d.count('comics'),
    d.count('pages'),
    d.count('aiCache'),
    d.count('aiCallLog'),
  ]);
  let bytes = 0;
  // navigator.storage.estimate() is cheaper than iterating blobs, and accurate enough.
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    bytes = est.usage ?? 0;
  }
  return { comics, pages, cache, logs, bytes };
}
