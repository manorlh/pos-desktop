// UUID utility compatible with older Node.js versions (Electron 13.x)
export function generateUUID(): string {
  // Fallback for older Node.js versions that don't have crypto.randomUUID()
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Polyfill for older versions
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
