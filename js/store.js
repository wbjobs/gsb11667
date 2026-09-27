/* store.js — IndexedDB 持久化：通知历史 + 免打扰设置
   IndexedDB 不可用（隐私模式 / file:// 限制）时降级为内存存储，UI 仍可完整演示。 */
const Store = (() => {
  const DB_NAME = 'notification-dnd';
  const DB_VERSION = 1;
  const HISTORY_STORE = 'history';
  const SETTINGS_STORE = 'settings';
  const SETTINGS_KEY = 'dnd';
  const MAX_HISTORY = 200;

  let dbPromise = null;
  let memoryMode = false;
  const memory = { history: [], settings: null };

  function indexedDBAvailable() {
    try {
      return typeof indexedDB !== 'undefined' && !!indexedDB;
    } catch (e) {
      return false;
    }
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!indexedDBAvailable()) {
        reject(new Error('IndexedDB 不可用'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          const store = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
    });
    return dbPromise;
  }

  function tx(storeName, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      const req = fn(store);
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error || new Error('事务失败'));
      t.onabort = () => reject(t.error || new Error('事务被中止'));
    }));
  }

  function withFallback(fn, fallback) {
    return fn().catch(err => {
      if (!memoryMode) {
        memoryMode = true;
        console.warn('[Store] 降级为内存存储：', err && err.message);
      }
      return fallback();
    });
  }

  function addHistory(record) {
    return withFallback(async () => {
      await tx(HISTORY_STORE, 'readwrite', store => {
        store.put(record);
        return {};
      });
      // 控制历史总量：超出上限删除最旧记录
      const all = await tx(HISTORY_STORE, 'readonly', s =>
        s.index('createdAt').getAllKeys());
      if (Array.isArray(all) && all.length > MAX_HISTORY) {
        const removeCount = all.length - MAX_HISTORY;
        await tx(HISTORY_STORE, 'readwrite', store => {
          all.slice(0, removeCount).forEach(key => store.delete(key));
          return {};
        });
      }
      return record;
    }, () => {
      memory.history.unshift(record);
      if (memory.history.length > MAX_HISTORY) {
        memory.history.length = MAX_HISTORY;
      }
      return record;
    });
  }

  function updateHistory(id, patch) {
    return withFallback(async () => {
      const existing = await tx(HISTORY_STORE, 'readonly', s => s.get(id));
      if (!existing) return null;
      const merged = Object.assign({}, existing, patch, { id });
      await tx(HISTORY_STORE, 'readwrite', s => s.put(merged));
      return merged;
    }, () => {
      const item = memory.history.find(r => r.id === id);
      if (!item) return null;
      Object.assign(item, patch);
      return item;
    });
  }

  function getAllHistory() {
    return withFallback(() => tx(HISTORY_STORE, 'readonly', s => s.getAll())
      .then(list => (list || []).sort((a, b) => b.createdAt - a.createdAt)),
      () => memory.history.slice().sort((a, b) => b.createdAt - a.createdAt));
  }

  function clearHistory() {
    return withFallback(() => tx(HISTORY_STORE, 'readwrite', s => {
      s.clear();
      return {};
    }), () => {
      memory.history = [];
      return {};
    });
  }

  function getSettings() {
    return withFallback(() => tx(SETTINGS_STORE, 'readonly', s => s.get(SETTINGS_KEY)),
      () => memory.settings);
  }

  function saveSettings(settings) {
    return withFallback(() => tx(SETTINGS_STORE, 'readwrite', s => {
      s.put(settings, SETTINGS_KEY);
      return {};
    }), () => {
      memory.settings = settings;
      return {};
    });
  }

  function isMemoryMode() {
    return memoryMode;
  }

  return {
    addHistory, updateHistory, getAllHistory, clearHistory,
    getSettings, saveSettings, isMemoryMode, indexedDBAvailable
  };
})();
