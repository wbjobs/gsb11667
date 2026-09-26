/* store.js — IndexedDB 布局持久化 */
const LayoutStore = (() => {
  const DB_NAME = 'wm-layout-manager';
  const DB_VERSION = 1;
  const STORE = 'layouts';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('当前浏览器不支持 IndexedDB，布局保存功能不可用'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'name' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const result = fn(store);
      t.oncomplete = () => resolve(result && result._value !== undefined ? result._value : result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('事务被中止'));
    }));
  }

  function requestToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    async save(layout) {
      // layout: { name, createdAt, screens, windows }
      const db = await open();
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(layout);
      return new Promise((resolve, reject) => {
        t.oncomplete = resolve;
        t.onerror = () => reject(t.error);
      });
    },
    async get(name) {
      const db = await open();
      return requestToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).get(name));
    },
    async list() {
      const db = await open();
      const all = await requestToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
      return (all || []).sort((a, b) => b.createdAt - a.createdAt);
    },
    async remove(name) {
      const db = await open();
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).delete(name);
      return new Promise((resolve, reject) => {
        t.oncomplete = resolve;
        t.onerror = () => reject(t.error);
      });
    }
  };
})();
