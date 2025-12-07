import fs from 'fs';
import path from 'path';

// W Next.js process.cwd() zwraca katalog projektu (braingain/)
// Ale w API routes może być inaczej, więc używamy absolutnej ścieżki
function getLogDir() {
  // Spróbuj najpierw katalog projektu
  const projectDir = process.cwd();
  const logDir = path.join(projectDir, 'logs');
  
  // Jeśli jesteśmy w katalogu braingain/braingain, idź poziom wyżej
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
const MAX_LINES = 1000; // Zachowaj ostatnie 1000 linii

// Flaga zapobiegająca rekurencji podczas zapisu logów
let isWritingLog = false;

// Lista wzorców do ignorowania (czarna lista)
const IGNORE_PATTERNS = [
  /Invalid source map/i,
  /sourceMapURL could not be parsed/i,
  /Only conformant source maps/i,
];

// Cache ostatnich logów do wykrywania duplikatów (grupowanie)
interface LogCacheEntry {
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

const logCache = new Map<string, LogCacheEntry>();
const DUPLICATE_WINDOW_MS = 5000; // 5 sekund - jeśli ten sam log w tym czasie, to duplikat
const MAX_CACHE_SIZE = 100;

// Upewnij się, że katalog logs istnieje
if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    // Debug: loguj gdzie tworzymy katalog
    console.log('[LOGGER] Utworzono katalog logów:', LOG_DIR);
  } catch (error) {
    console.error('[LOGGER] Błąd tworzenia katalogu logów:', error);
  }
}

/**
 * Sprawdza czy komunikat powinien być zignorowany
 */
function shouldIgnoreMessage(message: string): boolean {
  return IGNORE_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Formatuje stack trace na czytelne linie
 */
function formatStackTrace(stack: string | undefined): string {
  if (!stack) return '';
  
  // Podziel stack trace na linie i sformatuj
  const lines = stack.split('\n').map((line) => line.trim()).filter((line) => line);
  return '\n' + lines.map((line) => `    ${line}`).join('\n');
}

/**
 * Sprawdza czy to duplikat i zwraca sformatowaną wiadomość
 */
function checkDuplicate(message: string): { isDuplicate: boolean; formattedMessage: string } {
  const now = Date.now();
  const cacheKey = message.substring(0, 200); // Użyj pierwszych 200 znaków jako klucz
  
  const cached = logCache.get(cacheKey);
  
  if (cached && now - cached.lastSeen < DUPLICATE_WINDOW_MS) {
    // To duplikat - zwiększ licznik
    cached.count++;
    cached.lastSeen = now;
    
    // Jeśli to pierwszy duplikat, dodaj informację o grupowaniu
    if (cached.count === 2) {
      return {
        isDuplicate: true,
        formattedMessage: `${message}\n    [Ten komunikat pojawił się ${cached.count} razy w ciągu ${Math.round((now - cached.firstSeen) / 1000)}s]`,
      };
    }
    
    // Jeśli już było więcej niż 2, nie zapisuj ponownie
    return { isDuplicate: true, formattedMessage: '' };
  }
  
  // To nowy komunikat - zapisz do cache
  if (logCache.size >= MAX_CACHE_SIZE) {
    // Usuń najstarszy wpis
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

/**
 * Zapisuje log do pliku z timestampem
 */
function writeLog(level: string, message: string, data?: any) {
  // Zapobiegaj rekurencji
  if (isWritingLog) {
    return;
  }
  
  try {
    // Sprawdź czy powinien być zignorowany
    if (shouldIgnoreMessage(message)) {
      return;
    }
    
    isWritingLog = true;
    
    const timestamp = new Date().toISOString();
    
    // Sprawdź duplikaty
    const duplicateCheck = checkDuplicate(message);
    if (duplicateCheck.isDuplicate && duplicateCheck.formattedMessage === '') {
      // To duplikat, który już został zgrupowany - nie zapisuj ponownie
      isWritingLog = false;
      return;
    }
    
    const finalMessage = duplicateCheck.formattedMessage || message;
    
    // Formatuj dane
    let dataStr = '';
    if (data) {
      if (data instanceof Error) {
        // Dla błędów, dodaj stack trace w czytelnej formie
        dataStr = `\n    Error: ${data.message}${formatStackTrace(data.stack)}`;
      } else {
        dataStr = '\n' + JSON.stringify(data, null, 2).split('\n').map((line) => `    ${line}`).join('\n');
      }
    }
    
    const logLine = `[${timestamp}] [${level}] ${finalMessage}${dataStr}\n`;

    // Upewnij się, że katalog istnieje (może być problem z timing)
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    // Dodaj do pliku
    fs.appendFileSync(LOG_FILE, logLine, 'utf8');

    // Sprawdź rozmiar pliku i obetnij jeśli za duży
    trimLogFile();
  } catch (error) {
    // Nie rzucaj błędu jeśli nie można zapisać logu
    // Użyj oryginalnego console, żeby uniknąć rekurencji
    if (originalConsole) {
      originalConsole.error('[LOGGER] Błąd zapisu logu:', error);
      originalConsole.error('[LOGGER] Próba zapisu do:', LOG_FILE);
      originalConsole.error('[LOGGER] Katalog istnieje:', fs.existsSync(LOG_DIR));
    }
  } finally {
    isWritingLog = false;
  }
}

/**
 * Obcina plik logów, zachowując tylko ostatnie MAX_LINES linii
 */
function trimLogFile() {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return;
    }

    const content = fs.readFileSync(LOG_FILE, 'utf8');
    // Podziel na linie zachowując strukturę (nie filtruj pustych linii)
    const lines = content.split('\n');

    if (lines.length > MAX_LINES) {
      // Zachowaj tylko ostatnie MAX_LINES linii
      const trimmedLines = lines.slice(-MAX_LINES);
      // Zachowaj końcową pustą linię jeśli była
      const shouldEndWithNewline = content.endsWith('\n');
      fs.writeFileSync(LOG_FILE, trimmedLines.join('\n') + (shouldEndWithNewline ? '\n' : ''), 'utf8');
    }
  } catch (error) {
    console.error('Błąd przycinania logów:', error);
  }
}

// Zapisz oryginalne metody console przed nadpisaniem
// Używamy zmiennej let, żeby móc ją zaktualizować po inicjalizacji
let originalConsole: {
  log: typeof console.log;
  error: typeof console.error;
  warn: typeof console.warn;
  info: typeof console.info;
  debug: typeof console.debug;
} | null = null;

// Flaga zapobiegająca wielokrotnej inicjalizacji
let consoleIntercepted = false;

/**
 * Formatuje argumenty console do stringa (podobnie jak console.log)
 */
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

/**
 * Nadpisuje metody console, aby kopiować wszystko do pliku logów
 */
function setupConsoleInterception() {
  if (consoleIntercepted || typeof window !== 'undefined') {
    return; // Już przechwycone lub w przeglądarce
  }
  
  // Zapisz oryginalne metody PRZED nadpisaniem
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
    originalConsole.log(...args); // Wywołaj oryginalną metodę
    if (!shouldIgnoreMessage(message)) {
      writeLog('INFO', message);
    }
  };

  // console.error -> ERROR
  console.error = (...args: any[]) => {
    if (!originalConsole) return;
    const message = formatConsoleArgs(...args);
    originalConsole.error(...args); // Wywołaj oryginalną metodę
    if (!shouldIgnoreMessage(message)) {
      writeLog('ERROR', message);
    }
  };

  // console.warn -> WARN
  console.warn = (...args: any[]) => {
    if (!originalConsole) return;
    const message = formatConsoleArgs(...args);
    originalConsole.warn(...args); // Wywołaj oryginalną metodę
    if (!shouldIgnoreMessage(message)) {
      writeLog('WARN', message);
    }
  };

  // console.info -> INFO
  if (console.info) {
    console.info = (...args: any[]) => {
      if (!originalConsole) return;
      const message = formatConsoleArgs(...args);
      originalConsole.info(...args); // Wywołaj oryginalną metodę
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
      originalConsole.debug(...args); // Wywołaj oryginalną metodę
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

// Inicjalizuj przechwytywanie console (tylko w Node.js, nie w przeglądarce)
// Wywołaj to na końcu, po zdefiniowaniu wszystkich funkcji
if (typeof window === 'undefined') {
  setupConsoleInterception();
}

// Test zapisu przy starcie (tylko w development)
if (process.env.NODE_ENV === 'development') {
  try {
    logger.info('Logger zainicjalizowany', {
      logFile: LOG_FILE,
      logDir: LOG_DIR,
      cwd: process.cwd(),
    });
  } catch (e) {
    // Ignoruj błędy przy inicjalizacji
  }
}

/**
 * Czyta ostatnie N linii z pliku logów
 */
export function getRecentLogs(lines: number = 100): string[] {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      // Debug: zwróć informację o braku pliku
      console.log('[LOGGER] Plik logów nie istnieje:', LOG_FILE);
      console.log('[LOGGER] Katalog logów:', LOG_DIR);
      console.log('[LOGGER] Katalog istnieje:', fs.existsSync(LOG_DIR));
      return [];
    }

    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const allLines = content.split('\n').filter((line) => line.trim());
    return allLines.slice(-lines);
  } catch (error) {
    console.error('[LOGGER] Błąd odczytu logów:', error);
    console.error('[LOGGER] Próba odczytu z:', LOG_FILE);
    return [];
  }
}

/**
 * Czyści plik logów
 */
export function clearLogs(): void {
  try {
    if (fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, '', 'utf8');
    }
  } catch (error) {
    console.error('Błąd czyszczenia logów:', error);
  }
}

