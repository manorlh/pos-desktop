/**
 * Main-process file logger — survives restarts; readable from Settings without a terminal.
 */
import fs from 'fs';
import path from 'path';

const { app, shell } = require('electron');

const MAX_BYTES = 5 * 1024 * 1024;
const TAIL_MAX_BYTES = 256 * 1024;

let logDir = '';
let logFile = '';
let initialized = false;

function formatArg(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function writeLine(level: string, args: unknown[]): void {
  if (!initialized || !logFile) return;
  const message = args.map(formatArg).join(' ');
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    if (fs.existsSync(logFile)) {
      const size = fs.statSync(logFile).size;
      if (size + line.length > MAX_BYTES) {
        const oldPath = `${logFile}.old`;
        try {
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch {
          /* ignore */
        }
        fs.renameSync(logFile, oldPath);
      }
    }
    fs.appendFileSync(logFile, line, 'utf8');
  } catch {
    /* never throw from logger */
  }
}

function patchConsoleMethod(
  level: 'log' | 'info' | 'warn' | 'error' | 'debug',
  label: string,
): void {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    original(...args);
    writeLine(label, args);
  };
}

export function initMainLogger(): { logDir: string; logFile: string } {
  if (initialized) {
    return { logDir, logFile };
  }
  logDir = path.join(app.getPath('userData'), 'logs');
  logFile = path.join(logDir, 'main.log');
  fs.mkdirSync(logDir, { recursive: true });
  patchConsoleMethod('log', 'INFO');
  patchConsoleMethod('info', 'INFO');
  patchConsoleMethod('warn', 'WARN');
  patchConsoleMethod('error', 'ERROR');
  patchConsoleMethod('debug', 'DEBUG');
  initialized = true;
  console.log(
    `[Logger] Main log file: ${logFile} (app ${app.getVersion()}, ${process.platform})`,
  );
  return { logDir, logFile };
}

export function getMainLogFilePath(): string {
  return logFile || path.join(app.getPath('userData'), 'logs', 'main.log');
}

export function getMainLogDirPath(): string {
  return logDir || path.join(app.getPath('userData'), 'logs');
}

export async function openMainLogsFolder(): Promise<{ success: boolean; error?: string }> {
  const dir = getMainLogDirPath();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const result = await shell.openPath(dir);
    if (result) {
      return { success: false, error: result };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function readRecentMainLogs(maxLines = 200): { lines: string[]; logFile: string } {
  const file = getMainLogFilePath();
  const oldFile = `${file}.old`;
  let text = '';
  try {
    if (fs.existsSync(oldFile)) {
      text += fs.readFileSync(oldFile, 'utf8');
    }
    if (fs.existsSync(file)) {
      text += fs.readFileSync(file, 'utf8');
    }
  } catch {
    return { lines: [], logFile: file };
  }
  if (text.length > TAIL_MAX_BYTES) {
    text = text.slice(-TAIL_MAX_BYTES);
    const firstNl = text.indexOf('\n');
    if (firstNl >= 0) text = text.slice(firstNl + 1);
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return {
    lines: lines.slice(-maxLines),
    logFile: file,
  };
}
