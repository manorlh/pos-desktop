// Database operations should be done via IPC from main process
// This file is kept for type compatibility but actual DB operations go through Electron IPC

export const isDatabaseAvailable = () => {
  // Check if we're in Electron and can use IPC
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
};

export function safeRequireDatabase() {
  throw new Error('Database operations must be done via Electron IPC. better-sqlite3 cannot run in renderer process.');
}

