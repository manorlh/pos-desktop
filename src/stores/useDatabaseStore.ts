import { create } from 'zustand';
// Database operations will be added via IPC later
// import Database from 'better-sqlite3';
// import { initializeDatabase, getDatabase, closeDatabase } from '../database/database';

interface DatabaseStore {
  dbPath: string | null;
  db: any | null; // Database instance (will be null until IPC is implemented)
  isInitialized: boolean;
  setDbPath: (path: string) => void;
  initialize: (path: string) => void;
  close: () => void;
}

export const useDatabaseStore = create<DatabaseStore>((set) => ({
  dbPath: null,
  db: null,
  isInitialized: false,

  setDbPath: (path: string) => {
    set({ dbPath: path });
  },

  initialize: (path: string) => {
    // TODO: Initialize database via IPC
    set({ db: null, dbPath: path, isInitialized: false });
  },

  close: () => {
    // TODO: Close database via IPC
    set({ db: null, isInitialized: false });
  },
}));

