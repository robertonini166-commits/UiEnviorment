// Autosave (IndexedDB) + open/save project files.

const DB = 'rbxui';
const STORE = 'kv';

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function kvGet(key) {
  try {
    const d = await db();
    return await new Promise((res, rej) => {
      const t = d.transaction(STORE).objectStore(STORE).get(key);
      t.onsuccess = () => res(t.result);
      t.onerror = () => rej(t.error);
    });
  } catch {
    return null;
  }
}

export async function kvSet(key, value) {
  try {
    const d = await db();
    await new Promise((res, rej) => {
      const t = d.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
      t.onsuccess = () => res();
      t.onerror = () => rej(t.error);
    });
    return true;
  } catch {
    return false;
  }
}

export function startAutosave(store, onSaved) {
  let timer = null;
  store.on((w) => {
    if (!w.doc || w.live) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const ok = await kvSet('autosave', JSON.stringify(store.doc));
      if (ok) onSaved?.();
    }, 800);
  });
}
