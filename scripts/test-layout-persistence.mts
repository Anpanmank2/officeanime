import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import type { ExtensionContext } from 'vscode';

const require = createRequire(import.meta.url);
const { migrateAndLoadLayout, watchLayoutFile } =
  require('../src/layoutPersistence.ts') as typeof import('../src/layoutPersistence.js');
const { createLayoutStore, handleLayoutCommand } =
  require('../src/layoutStore.ts') as typeof import('../src/layoutStore.js');

const oldLayout = {
  version: 1,
  cols: 4,
  rows: 3,
  tiles: Array(12).fill(1),
  furniture: [],
  layoutRevision: 1,
  label: 'my custom room',
};
const newLayout = { ...oldLayout, layoutRevision: 4, label: 'compact room' };

function fixture(run: (file: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'officeanime-layout-test-'));
  try {
    run(path.join(dir, 'layout.json'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('new bundled revisions preserve saved layouts until explicitly selected', () =>
  fixture((file) => {
    const original = process.env.OFFICEANIME_DATA_DIR;
    process.env.OFFICEANIME_DATA_DIR = path.dirname(file);
    try {
      const store = createLayoutStore(file);
      store.save(oldLayout);
      const context = {
        workspaceState: {
          get: () => undefined,
          update: () => {
            throw new Error('saved state must remain untouched');
          },
        },
      } as unknown as ExtensionContext;
      assert.deepEqual(migrateAndLoadLayout(context, newLayout), {
        layout: oldLayout,
        wasReset: false,
      });
      assert.deepEqual(store.read(), oldLayout);
    } finally {
      if (original === undefined) delete process.env.OFFICEANIME_DATA_DIR;
      else process.env.OFFICEANIME_DATA_DIR = original;
    }
  }));

test('explicit replacement survives restart and repeated application preserves the old room', () =>
  fixture((file) => {
    const store = createLayoutStore(file);
    store.save(oldLayout);
    store.replace(newLayout);
    createLayoutStore(file).replace(newLayout);
    assert.deepEqual(createLayoutStore(file).read(), newLayout);
    assert.deepEqual(createLayoutStore(file).restore(), oldLayout);
    assert.deepEqual(createLayoutStore(file).read(), oldLayout);
    // Returning to the compact room is also reversible.
    assert.deepEqual(createLayoutStore(file).restore(), newLayout);
  }));

test('the shipped legacy room remains loadable and restores exactly, including decorative UIDs', () =>
  fixture((file) => {
    const legacy = JSON.parse(
      fs.readFileSync(
        new URL('../webview-ui/public/assets/default-layout-3.json', import.meta.url),
        'utf8',
      ),
    );
    const store = createLayoutStore(file);
    store.save(legacy);
    store.replace(newLayout);
    assert.deepEqual(store.restore(), legacy);
    assert.deepEqual(createLayoutStore(file).read(), legacy);
  }));

test('a corrupt save stays recoverable and is not overwritten on load or replacement', () =>
  fixture((file) => {
    const original = process.env.OFFICEANIME_DATA_DIR;
    process.env.OFFICEANIME_DATA_DIR = path.dirname(file);
    try {
      fs.writeFileSync(file, '{unfinished');
      const context = { workspaceState: { get: () => undefined } } as unknown as ExtensionContext;
      assert.deepEqual(migrateAndLoadLayout(context, newLayout)?.layout, newLayout);
      assert.throws(() => createLayoutStore(file).replace(newLayout));
      assert.equal(fs.readFileSync(file, 'utf8'), '{unfinished');
    } finally {
      if (original === undefined) delete process.env.OFFICEANIME_DATA_DIR;
      else process.env.OFFICEANIME_DATA_DIR = original;
    }
  }));

test('malformed layout commands report failure and preserve the last valid room', () =>
  fixture((file) => {
    const store = createLayoutStore(file);
    store.save(oldLayout);
    const replies: unknown[] = [];
    assert.equal(
      handleLayoutCommand(
        { type: 'saveLayout', layout: { ...newLayout, tiles: [] } },
        (reply) => replies.push(reply),
        newLayout,
        store,
      ),
      true,
    );
    assert.equal((replies.at(-1) as { success: boolean }).success, false);
    assert.deepEqual(store.read(), oldLayout);
    assert.equal(store.hasPrevious(), false);
    assert.equal(
      handleLayoutCommand(
        { type: 'task:submit' },
        () => assert.fail('must not handle work'),
        newLayout,
        store,
      ),
      false,
    );
  }));

test('host commands acknowledge only persisted replacements, with one layout notification', () =>
  fixture((file) => {
    const store = createLayoutStore(file);
    store.save(oldLayout);
    const replies: Array<{ type?: string; success?: boolean; hasPrevious?: boolean }> = [];
    let changed = 0;
    handleLayoutCommand(
      { type: 'layout:useDefault' },
      (reply) => replies.push(reply as (typeof replies)[number]),
      newLayout,
      store,
      (layout) => {
        changed++;
        assert.deepEqual(store.read(), layout);
      },
    );
    assert.equal(changed, 1);
    assert.equal(replies.filter((r) => r.type === 'layoutLoaded').length, 0);
    assert.equal(replies.at(-1)?.hasPrevious, true);
    assert.equal(replies.at(-1)?.success, true);
    const fresh = createLayoutStore(file);
    handleLayoutCommand({ type: 'layout:restore' }, () => {}, newLayout, fresh);
    assert.deepEqual(fresh.read(), oldLayout);
  }));

test('failed workspace migration retains the original workspace record', () =>
  fixture((file) => {
    const original = process.env.OFFICEANIME_DATA_DIR;
    fs.writeFileSync(file, 'directory cannot be created here');
    process.env.OFFICEANIME_DATA_DIR = file;
    let cleared = false;
    try {
      const context = {
        workspaceState: {
          get: () => oldLayout,
          update: () => {
            cleared = true;
          },
        },
      } as unknown as ExtensionContext;
      assert.deepEqual(migrateAndLoadLayout(context, newLayout)?.layout, oldLayout);
      assert.equal(cleared, false);
    } finally {
      if (original === undefined) delete process.env.OFFICEANIME_DATA_DIR;
      else process.env.OFFICEANIME_DATA_DIR = original;
    }
  }));

test('a local save does not swallow the next external replacement', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'officeanime-layout-watch-'));
  const original = process.env.OFFICEANIME_DATA_DIR;
  process.env.OFFICEANIME_DATA_DIR = dir;
  const store = createLayoutStore();
  store.save(oldLayout);
  const received: unknown[] = [];
  let notify: (() => void) | undefined;
  const watcher = watchLayoutFile((layout) => {
    received.push(layout);
    notify?.();
  });
  try {
    store.save(newLayout);
    watcher.markOwnWrite();
    // Allow filesystem events from our own atomic save to settle.
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(received.length, 0);
    const externalLayout = { ...oldLayout, label: 'another window' };
    const arrived = new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('External layout was missed')), 5000);
      notify = () => {
        clearTimeout(deadline);
        resolve();
      };
    });
    store.save(externalLayout);
    await arrived;
    assert.deepEqual(received, [externalLayout]);
  } finally {
    watcher.dispose();
    if (original === undefined) delete process.env.OFFICEANIME_DATA_DIR;
    else process.env.OFFICEANIME_DATA_DIR = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
