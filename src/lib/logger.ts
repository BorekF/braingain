import fs from 'fs';
import path from 'path';

function getLogDir() {
  const projectDir = process.cwd();
  const logDir = path.join(projectDir, 'logs');

  if (projectDir.endsWith('braingain') && !fs.existsSync(logDir)) {
    const parentDir = path.join(projectDir, '..', 'logs');
    if (fs.existsSync(path.join(projectDir, '..'))) {
      return parentDir;
    }
  }
  
  return logDir;
}

const LOG_DIR = getLogDir();
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_LINES = 1000;

let isWritingLog = false;

const IGNORE_PATTERNS = [
  /Invalid source map/i,
  /sourceMapURL could not be parsed/i,
  /Only conformant source maps/i,
];

interface LogCacheEntry {
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

const logCache = new Map<string, LogCacheEntry>();
const DUPLICATE_WINDOW_MS = 5000;
const MAX_CACHE_SIZE = 100;

if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    console.log('[LOGGER] Created logs directory:', LOG_DIR);
  } catch (error) {
    console.error('[LOGGER] Failed to create logs directory:', error);
  }
}

/** Checks if message should be ignored */
function shouldIgnoreMessage(message: string): boolean {
  return IGNORE_PATTERNS.some((pattern) => pattern.test(message));
}

/** Formats stack trace into readable lines */
function formatStackTrace(stack: string | undefined): string {
  if (!stack) return '';
  
  const lines = stack.split('\n').map((line) => line.trim()).filter((line) => line);
  return '\n' + lines.map((line) => `    ${line}`).join('\n');
}

/** Checks for duplicate and returns formatted message */
function checkDuplicate(message: string): { isDuplicate: boolean; formattedMessage: string } {
  const now = Date.now();
  const cacheKey = message.substring(0, 200);
  
  const cached = logCache.get(cacheKey);
  
  if (cached && now - cached.lastSeen < DUPLICATE_WINDOW_MS) {
    cached.count++;
    cached.lastSeen = now;
    
    if (cached.count === 2) {
      return {
        isDuplicate: true,
        formattedMessage: `${message}\n    [This message appeared ${cached.count} times within ${Math.round((now - cached.firstSeen) / 1000)}s]`,
      };
    }
    
    return { isDuplicate: true, formattedMessage: '' };
  }
  
  if (logCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = Array.from(logCache.entries())
      .sort((a, b) => a[1].firstSeen - b[1].firstSeen)[0][0];
    logCache.delete(oldestKey);
  }
  
  logCache.set(cacheKey, {
    message,
    count: 1,
    firstSeen: now,
    lastSeen: now,
  });
  
  return { isDuplicate: false, formattedMessage: message };
}

/** Writes log to file with timestamp */
function writeLog(level: string, message: string, data?: any) {
  if (isWritingLog) {
    return;
  }
  
  try {
    if (shouldIgnoreMessage(message)) {
      return;
    }
    
    isWritingLog = true;
    
    const timestamp = new Date().toISOString();
    
    const duplicateCheck = checkDuplicate(message);
    if (duplicateCheck.isDuplicate && duplicateCheck.formattedMessage === '') {
      isWritingLog = false;
      return;
    }
    
    const finalMessage = duplicateCheck.formattedMessage || message;
    
    let dataStr = '';
    if (data) {
      if (data instanceof Error) {
        dataStr = `\n    Error: ${data.message}${formatStackTrace(data.stack)}`;
      } else {
        dataStr = '\n' + JSON.stringify(data, null, 2).split('\n').map((line) => `    ${line}`).join('\n');
      }
    }
    
    const logLine = `[${timestamp}] [${level}] ${finalMessage}${dataStr}\n`;

    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    fs.appendFileSync(LOG_FILE, logLine, 'utf8');
    trimLogFile();
  } catch (error) {
    if (originalConsole) {
      originalConsole.error('[LOGGER] Failed to write log:', error);
      originalConsole.error('[LOGGER] Attempted to write to:', LOG_FILE);
      originalConsole.error('[LOGGER] Directory exists:', fs.existsSync(LOG_DIR));
    }
  } finally {
    isWritingLog = false;
  }
}

/** Trims log file to last MAX_LINES */
function trimLogFile() {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return;
    }

    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n');

    if (lines.length > MAX_LINES) {
      const trimmedLines = lines.slice(-MAX_LINES);
      const shouldEndWithNewline = content.endsWith('\n');
      fs.writeFileSync(LOG_FILE, trimmedLines.join('\n') + (shouldEndWithNewline ? '\n' : ''), 'utf8');
    }
  } catch (error) {
    console.error('Failed to trim logs:', error);
  }
}

let originalConsole: {
  log: typeof console.log;
  error: typeof console.error;
  warn: typeof console.warn;
  info: typeof console.info;
  debug: typeof console.debug;
} | null = null;

let consoleIntercepted = false;

/** Formats console args to string (like console.log) */
function formatConsoleArgs(...args: any[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') {
        return arg;
      }
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
      }
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

/** Overwrites console methods to copy output to log file */
function setupConsoleInterception() {
  if (consoleIntercepted || typeof window !== 'undefined') {
    return;
  }
  
  originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: (console.info?.bind(console) || console.log.bind(console)) as typeof console.info,
    debug: (console.debug?.bind(console) || console.log.bind(console)) as typeof console.debug,
  };
  
  // console.log -> INFO
  console.log = (...args: any[]) => {
    if (!originalConsole) return;
    const message = formatConsoleArgs(...args);
    originalConsole.log(...args);
    if (!shouldIgnoreMessage(message)) {
      writeLog('INFO', message);
    }
  };

  console.error = (...args: any[]) => {
    if (!originalConsole) return;
    const message = formatConsoleArgs(...args);
    originalConsole.error(...args);
    if (!shouldIgnoreMessage(message)) {
      writeLog('ERROR', message);
    }
  };

  console.warn = (...args: any[]) => {
    if (!originalConsole) return;
    const message = formatConsoleArgs(...args);
    originalConsole.warn(...args);
    if (!shouldIgnoreMessage(message)) {
      writeLog('WARN', message);
    }
  };

  if (console.info) {
    console.info = (...args: any[]) => {
      if (!originalConsole) return;
      const message = formatConsoleArgs(...args);
      originalConsole.info(...args);
      if (!shouldIgnoreMessage(message)) {
        writeLog('INFO', message);
      }
    };
  }

  // console.debug -> DEBUG
  if (console.debug) {
    console.debug = (...args: any[]) => {
      if (!originalConsole) return;
      const message = formatConsoleArgs(...args);
      originalConsole.debug(...args);
      if (process.env.NODE_ENV === 'development' && !shouldIgnoreMessage(message)) {
        writeLog('DEBUG', message);
      }
    };
  }
  
  consoleIntercepted = true;
}

export const logger = {
  error: (message: string, data?: any) => {
    if (originalConsole) {
      originalConsole.error(message, data || '');
    } else {
      console.error(message, data || '');
    }
    if (!shouldIgnoreMessage(message)) {
      writeLog('ERROR', message, data);
    }
  },
  warn: (message: string, data?: any) => {
    if (originalConsole) {
      originalConsole.warn(message, data || '');
    } else {
      console.warn(message, data || '');
    }
    if (!shouldIgnoreMessage(message)) {
      writeLog('WARN', message, data);
    }
  },
  info: (message: string, data?: any) => {
    if (originalConsole) {
      originalConsole.log(message, data || '');
    } else {
      console.log(message, data || '');
    }
    if (!shouldIgnoreMessage(message)) {
      writeLog('INFO', message, data);
    }
  },
  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      if (originalConsole) {
        originalConsole.debug(message, data || '');
      } else {
        console.debug(message, data || '');
      }
      if (!shouldIgnoreMessage(message)) {
        writeLog('DEBUG', message, data);
      }
    }
  },
};

if (typeof window === 'undefined') {
  setupConsoleInterception();
}

if (process.env.NODE_ENV === 'development') {
  try {
    logger.info('Logger initialized', {
      logFile: LOG_FILE,
      logDir: LOG_DIR,
      cwd: process.cwd(),
    });
  } catch (e) {
  }
}

/** Reads last N lines from log file */
export function getRecentLogs(lines: number = 100): string[] {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      console.log('[LOGGER] Log file does not exist:', LOG_FILE);
      console.log('[LOGGER] Logs directory:', LOG_DIR);
      console.log('[LOGGER] Directory exists:', fs.existsSync(LOG_DIR));
      return [];
    }

    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const allLines = content.split('\n').filter((line) => line.trim());
    return allLines.slice(-lines);
  } catch (error) {
    console.error('[LOGGER] Failed to read logs:', error);
    console.error('[LOGGER] Attempted to read from:', LOG_FILE);
    return [];
  }
}

/** Clears log file */
export function clearLogs(): void {
  try {
    if (fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, '', 'utf8');
    }
  } catch (error) {
    console.error('Failed to clear logs:', error);
  }
}

