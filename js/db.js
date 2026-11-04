/**
 * Shiftly IndexedDB Layer (js/db.js)
 * Standalone browser database with transaction safety and persistence guarantee.
 * Supports work shifts and vacation / absence entries.
 */

const DB_NAME = 'shiftly_db';
const DB_VERSION = 2;

class ShiftlyDB {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    if (navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persist();
        console.info(`Shiftly Storage Persisted: ${isPersisted}`);
      } catch (err) {
        console.warn('Storage persistence request failed:', err);
      }
    }

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Store for all records (work shifts, vacation, sick, etc.)
        if (!db.objectStoreNames.contains('shifts')) {
          const shiftStore = db.createObjectStore('shifts', { keyPath: 'id' });
          shiftStore.createIndex('date', 'date', { unique: false });
          shiftStore.createIndex('year_month', 'year_month', { unique: false });
          shiftStore.createIndex('type', 'type', { unique: false });
        } else {
          const shiftStore = e.target.transaction.objectStore('shifts');
          if (!shiftStore.indexNames.contains('type')) {
            shiftStore.createIndex('type', 'type', { unique: false });
          }
        }

        // Store for app settings
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      req.onerror = (e) => {
        console.error('IndexedDB open error:', e);
        reject(e.target.error);
      };
    });
  }

  // --- Records (Shifts & Vacation) CRUD ---

  async getAllRecords() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('shifts', 'readonly');
      const store = tx.objectStore('shifts');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async saveRecord(record) {
    await this.init();
    if (!record.id) {
      record.id = 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    }
    if (!record.type) {
      record.type = 'work';
    }
    if (!record.year_month && record.date) {
      record.year_month = record.date.substring(0, 7);
    }
    record.updated_at = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('shifts', 'readwrite');
      const store = tx.objectStore('shifts');
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteRecord(recordId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('shifts', 'readwrite');
      const store = tx.objectStore('shifts');
      const req = store.delete(recordId);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Settings CRUD ---

  async getSetting(key, defaultValue = null) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.value !== undefined) {
          resolve(req.result.value);
        } else {
          resolve(defaultValue);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async setSetting(key, value) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const req = store.put({ key, value, updated_at: new Date().toISOString() });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Backup / Restore Core ---

  async exportAllData() {
    await this.init();
    const records = await this.getAllRecords();
    const settings = await new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    return {
      version: 2,
      exported_at: new Date().toISOString(),
      app: 'Shiftly',
      records,
      settings
    };
  }

  async importAllData(payload) {
    await this.init();
    const items = payload.records || payload.shifts;
    if (!payload || !Array.isArray(items)) {
      throw new Error('Ungültiges Backup-Format: Keine Datensätze gefunden.');
    }

    const tx = this.db.transaction(['shifts', 'settings'], 'readwrite');
    const shiftStore = tx.objectStore('shifts');
    const settingStore = tx.objectStore('settings');

    // Clear existing
    await new Promise((res, rej) => {
      const req = shiftStore.clear();
      req.onsuccess = res;
      req.onerror = rej;
    });

    for (const r of items) {
      if (!r.type) r.type = 'work';
      shiftStore.put(r);
    }

    if (Array.isArray(payload.settings)) {
      for (const s of payload.settings) {
        settingStore.put(s);
      }
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const db = new ShiftlyDB();
