// IndexedDB 持久化：通知历史 + 免打扰时段设置。

const DB_NAME = 'notification-dnd-manager';
const DB_VERSION = 1;
const HISTORY = 'history';
const SETTINGS = 'settings';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY)) {
        db.createObjectStore(HISTORY, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(SETTINGS)) {
        db.createObjectStore(SETTINGS, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = fn(tx.objectStore(store));
    let result;
    if (request) request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  }));
}

// 新增历史记录，返回自增 id
export function addHistory(entry) {
  return run(HISTORY, 'readwrite', s => s.add({ ...entry, time: Date.now() }));
}

export function updateHistory(entry) {
  return run(HISTORY, 'readwrite', s => s.put(entry));
}

export async function listHistory() {
  const all = await run(HISTORY, 'readonly', s => s.getAll());
  return (all || []).sort((a, b) => b.time - a.time);
}

export function clearHistory() {
  return run(HISTORY, 'readwrite', s => s.clear());
}

export function saveSetting(key, value) {
  return run(SETTINGS, 'readwrite', s => s.put({ key, value }));
}

export async function getSetting(key, fallback = null) {
  const row = await run(SETTINGS, 'readonly', s => s.get(key));
  return row ? row.value : fallback;
}
