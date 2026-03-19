/*
 * FitVision - Local storage scan history module
 */

const STORAGE_KEY = 'fitvision_scan_history_v1';

export class StorageManager {
  constructor() {
    this.history = this.loadHistory();
  }

  loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (error) {
      console.warn('Failed to load scan history', error);
      return [];
    }
  }

  saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.history));
    } catch (error) {
      console.warn('Failed to save scan history', error);
    }
  }

  getAll() {
    return [...this.history];
  }

  add(scan) {
    this.history.unshift(scan);
    // Keep recent 10
    this.history = this.history.slice(0, 10);
    this.saveHistory();
  }

  clear() {
    this.history = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  getLatest() {
    return this.history.length ? this.history[0] : null;
  }
}
