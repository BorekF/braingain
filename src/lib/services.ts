'use server';

import { Innertube } from 'youtubei.js';
import OpenAI from 'openai';
import { extractVideoId } from './utils';
import { logger } from './logger';
import { getYouTubeTranscriptWithGroq } from './groq-transcription';

// Walidacja i inicjalizacja klienta OpenAI
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY nie jest ustawiony w zmiennych środowiskowych. Sprawdź plik .env.local'
    );
  }
  return new OpenAI({ apiKey });
}

// Lazy initialization - klient jest tworzony tylko gdy jest potrzebny
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    openai = getOpenAIClient();
  }
  return openai;
}

/**
 * Pobiera transkrypt z YouTube i filtruje segmenty do określonego zakresu czasu
 * @param url - URL wideo YouTube
 * @param startSeconds - Czas startu w sekundach (od którego momentu pobrać transkrypt)
 * @param endSeconds - Czas końca w sekundach (do którego momentu pobrać transkrypt, opcjonalnie)
 * @returns Połączony tekst transkryptu lub null w przypadku błędu
 */
export async function getYouTubeTranscript(
  url: string,
  startSeconds: number = 0,
  endSeconds?: number
): Promise<string | null> {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Nieprawidłowy URL YouTube');
    }

    const youtube = await Innertube.create();
    
    // Przechwyć błędy podczas pobierania informacji o wideo
    let info;
    try {
      info = await youtube.getInfo(videoId);
    } catch (infoError: any) {
      // Błąd podczas pobierania info - zaloguj i rzuć dalej
      logger.warn('Błąd pobierania informacji o wideo YouTube', {
        url,
        videoId,
        error: infoError?.message || String(infoError),
        errorName: infoError?.name,
      });
      throw infoError; // Rzuć dalej, żeby główny catch mógł obsłużyć
    }
    
    // Przechwyć błędy podczas pobierania transkryptu
    let transcriptData;
    try {
      transcriptData = await info.getTranscript();
    } catch (transcriptError: any) {
      // Błąd podczas pobierania transkryptu - zaloguj i rzuć dalej
      // YouTube.js błędy mają strukturę z date, version, info
      const isParserError =
        transcriptError?.name === 'ParserError' ||
        transcriptError?.info !== undefined ||
        transcriptError?.message?.includes('Type mismatch') ||
        transcriptError?.message?.includes('Parser');
      
      if (isParserError) {
        logger.warn('YouTube.js: Błąd parsowania transkryptu (normalne dla niektórych wideo)', {
          url,
          videoId,
          error: transcriptError?.message || String(transcriptError),
          errorName: transcriptError?.name,
          errorDate: transcriptError?.date,
          errorVersion: transcriptError?.version,
          errorInfo: transcriptError?.info,
        });
      } else {
        logger.error('Błąd pobierania transkryptu YouTube', {
          url,
          videoId,
          error: transcriptError?.message || String(transcriptError),
          errorName: transcriptError?.name,
          stack: transcriptError?.stack,
        });
      }
      throw transcriptError; // Rzuć dalej, żeby główny catch mógł obsłużyć
    }

    // Sprawdzenie czy transkrypt jest dostępny
    if (!transcriptData?.transcript?.content?.body?.initial_segments) {
      throw new Error('Transkrypt nie jest dostępny dla tego wideo');
    }

    // Konwersja struktury InnerTube na tablicę segmentów z czasem
    const segments = transcriptData.transcript.content.body.initial_segments.map(
      (seg: any) => ({
        text: seg.snippet.text,
        start: seg.snippet.start_ms || 0,
        duration: seg.snippet.duration_ms || 0,
      })
    );

    // Filtrowanie segmentów: bierzemy tylko te w określonym zakresie czasu
    // startSeconds i endSeconds są w sekundach, więc konwertujemy na milisekundy
    const startMs = startSeconds * 1000;
    const endMs = endSeconds !== undefined ? endSeconds * 1000 : undefined;
    
    const filteredSegments = segments.filter((seg: any) => {
      const segmentEnd = seg.start + seg.duration;
      // Segment musi kończyć się po startSeconds
      if (segmentEnd < startMs) {
        return false;
      }
      // Jeśli określono endSeconds, segment musi zaczynać się przed endSeconds
      if (endMs !== undefined && seg.start >= endMs) {
        return false;
      }
      return true;
    });

    if (filteredSegments.length === 0) {
      const rangeDesc = endSeconds !== undefined 
        ? `w zakresie ${startSeconds}s - ${endSeconds}s` 
        : `po czasie ${startSeconds}s`;
      throw new Error(`Brak segmentów transkryptu ${rangeDesc}`);
    }

    // Połączenie tekstu z segmentów
    const transcript = filteredSegments.map((seg: any) => seg.text).join(' ');

    return transcript;
  } catch (error: any) {
    // Błędy YouTube.js mają specjalną strukturę z date, version, info
    // Sprawdzamy czy to błąd parsowania (normalne dla niektórych wideo)
    const isParserError =
      error?.message?.includes('Type mismatch') ||
      error?.message?.includes('Parser') ||
      error?.name === 'ParserError' ||
      (error?.info && typeof error.info === 'object');

    if (isParserError) {
      logger.warn('YouTube.js: Nie można sparsować struktury wideo (to normalne dla niektórych wideo)', {
        url,
        error: error?.message || String(error),
        errorName: error?.name,
        errorDate: error?.date,
        errorVersion: error?.version,
      });
    } else {
      logger.error('Błąd pobierania transkryptu YouTube', {
        url,
        error: error?.message || String(error),
        errorName: error?.name,
        stack: error?.stack,
        fullError: error,
      });
    }
    return null; // Sygnał do UI, by pokazać pole do ręcznego wklejenia
  }
}

/**
 * Parsuje plik PDF i wyciąga z niego tekst
 * @param file - Plik PDF jako File object
 * @returns Wyciągnięty tekst z PDF lub null w przypadku błędu
 */
export async function parsePDF(file: File): Promise<string | null> {
  try {
    // Polyfill dla brakujących API przeglądarki w Node.js
    // pdf-parse wymaga tych API, które nie są dostępne w Node.js
    if (typeof global !== 'undefined' && typeof global.DOMMatrix === 'undefined') {
      // Polyfill dla DOMMatrix
      class DOMMatrixPolyfill {
        a: number = 1;
        b: number = 0;
        c: number = 0;
        d: number = 1;
        e: number = 0;
        f: number = 0;
        m11: number = 1;
        m12: number = 0;
        m21: number = 0;
        m22: number = 1;
        m41: number = 0;
        m42: number = 0;
        m13: number = 0;
        m14: number = 0;
        m23: number = 0;
        m24: number = 0;
        m31: number = 0;
        m32: number = 0;
        m33: number = 1;
        m34: number = 0;
        m43: number = 0;
        m44: number = 1;
        is2D: boolean = true;
        isIdentity: boolean = true;

        constructor(init?: string | number[]) {
          if (init) {
            // Prosta implementacja - można rozszerzyć jeśli potrzeba
            if (typeof init === 'string') {
              // Parsowanie stringa matrix() - uproszczone
              const values = init.match(/[\d.-]+/g);
              if (values && values.length >= 6) {
                this.a = parseFloat(values[0]);
                this.b = parseFloat(values[1]);
                this.c = parseFloat(values[2]);
                this.d = parseFloat(values[3]);
                this.e = parseFloat(values[4]);
                this.f = parseFloat(values[5]);
                this.m11 = this.a;
                this.m12 = this.b;
                this.m21 = this.c;
                this.m22 = this.d;
                this.m41 = this.e;
                this.m42 = this.f;
                this.isIdentity = false;
              }
            }
          }
        }

        multiply(other: DOMMatrixPolyfill): DOMMatrixPolyfill {
          const result = new DOMMatrixPolyfill();
          result.a = this.a * other.a + this.c * other.b;
          result.b = this.b * other.a + this.d * other.b;
          result.c = this.a * other.c + this.c * other.d;
          result.d = this.b * other.c + this.d * other.d;
          result.e = this.a * other.e + this.c * other.f + this.e;
          result.f = this.b * other.e + this.d * other.f + this.f;
          result.m11 = result.a;
          result.m12 = result.b;
          result.m21 = result.c;
          result.m22 = result.d;
          result.m41 = result.e;
          result.m42 = result.f;
          result.isIdentity = false;
          return result;
        }

        translate(x: number, y: number): DOMMatrixPolyfill {
          const translate = new DOMMatrixPolyfill();
          translate.e = x;
          translate.f = y;
          translate.m41 = x;
          translate.m42 = y;
          translate.isIdentity = false;
          return this.multiply(translate);
        }

        scale(x: number, y?: number): DOMMatrixPolyfill {
          const scale = new DOMMatrixPolyfill();
          scale.a = x;
          scale.d = y ?? x;
          scale.m11 = x;
          scale.m22 = y ?? x;
          scale.isIdentity = false;
          return this.multiply(scale);
        }

        rotate(angle: number): DOMMatrixPolyfill {
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const rotate = new DOMMatrixPolyfill();
          rotate.a = cos;
          rotate.b = sin;
          rotate.c = -sin;
          rotate.d = cos;
          rotate.m11 = cos;
          rotate.m12 = sin;
          rotate.m21 = -sin;
          rotate.m22 = cos;
          rotate.isIdentity = false;
          return this.multiply(rotate);
        }
      }

      // Polyfill dla ImageData
      if (typeof global.ImageData === 'undefined') {
        (global as any).ImageData = class ImageDataPolyfill {
          data: Uint8ClampedArray;
          width: number;
          height: number;

          constructor(dataOrWidth: Uint8ClampedArray | number, heightOrWidth?: number, height?: number) {
            if (dataOrWidth instanceof Uint8ClampedArray) {
              this.data = dataOrWidth;
              this.width = heightOrWidth || 0;
              this.height = height || 0;
            } else {
              this.width = dataOrWidth;
              this.height = heightOrWidth || 0;
              this.data = new Uint8ClampedArray(this.width * this.height * 4);
            }
          }
        };
      }

      // Polyfill dla Path2D
      if (typeof global.Path2D === 'undefined') {
        (global as any).Path2D = class Path2DPolyfill {
          // Minimalna implementacja - pdf-parse prawdopodobnie nie używa tego intensywnie
          constructor(path?: string | Path2DPolyfill) {
            // Pusta implementacja
          }
          moveTo(x: number, y: number): void {}
          lineTo(x: number, y: number): void {}
          arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void {}
          closePath(): void {}
        };
      }

      (global as any).DOMMatrix = DOMMatrixPolyfill;
    }

    // Lazy loading pdf-parse - importujemy tylko gdy jest potrzebny
    // pdf-parse używa CommonJS, więc używamy require
    // Next.js powinien traktować to jako zewnętrzny pakiet (serverExternalPackages)
    const pdfParseModule = require('pdf-parse');
    
    // Konwersja File na Uint8Array (pdf-parse 2.4.5 wymaga Uint8Array, nie Buffer)
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    // Dla starszych wersji pdf-parse, które mogą wymagać Buffer
    const buffer = Buffer.from(arrayBuffer);

    // pdf-parse w wersji 2.4.5 może eksportować zarówno funkcję jak i klasę PDFParse
    // Obsługujemy różne formaty eksportu (funkcja dla starszych wersji, klasa dla nowszych)
    let data: any;
    
    // Próba 1: Sprawdź czy główny eksport to funkcja (starsze wersje lub główny eksport)
    // Nawet jeśli moduł ma klasę PDFParse, główny eksport może być funkcją
    if (typeof pdfParseModule === 'function') {
      // Spróbuj z Uint8Array (wersja 2.4.5), fallback do Buffer (starsze wersje)
      try {
        data = await pdfParseModule(uint8Array);
      } catch (e) {
        data = await pdfParseModule(buffer);
      }
    }
    // Próba 2: Sprawdź czy to obiekt z właściwością default (ESM default export)
    else if (pdfParseModule && typeof pdfParseModule.default === 'function') {
      // Spróbuj z Uint8Array (wersja 2.4.5), fallback do Buffer (starsze wersje)
      try {
        data = await pdfParseModule.default(uint8Array);
      } catch (e) {
        data = await pdfParseModule.default(buffer);
      }
    }
    // Próba 3: Sprawdź czy to obiekt z klasą PDFParse (wersja 2.4.5+)
    else if (pdfParseModule && pdfParseModule.PDFParse) {
      const PDFParseClass = pdfParseModule.PDFParse;
      if (typeof PDFParseClass === 'function') {
        try {
          // Sprawdź czy PDFParse ma metodę statyczną parse() (jak w starszych wersjach)
          if (typeof PDFParseClass.parse === 'function') {
            // Spróbuj z Uint8Array (wersja 2.4.5)
            try {
              data = await PDFParseClass.parse(uint8Array);
            } catch (e) {
              // Fallback do Buffer dla starszych wersji
              data = await PDFParseClass.parse(buffer);
            }
          }
          // W przeciwnym razie, spróbuj użyć jako konstruktora lub funkcji
          else {
            // PDFParse w wersji 2.4.5 może być używane jako funkcja (bez new) lub klasa (z new)
            let instance: any;
            
            // Próba 1: Wywołaj jako funkcję (bez new) z Uint8Array - pdf-parse 2.4.5 wymaga Uint8Array
            try {
              instance = PDFParseClass(uint8Array);
              // Jeśli zwróci Promise, await
              if (instance && typeof instance.then === 'function') {
                instance = await instance;
              }
            } catch (e1) {
              // Próba 2: Konstruktor z Uint8Array bezpośrednio (z new)
              try {
                instance = new PDFParseClass(uint8Array);
              } catch (e2) {
                // Próba 3: Konstruktor z opcjami zawierającymi Uint8Array jako 'data'
                try {
                  instance = new PDFParseClass({ data: uint8Array });
                } catch (e3) {
                  // Próba 4: Konstruktor z opcjami zawierającymi Uint8Array jako 'buffer'
                  try {
                    instance = new PDFParseClass({ buffer: uint8Array });
                  } catch (e4) {
                    // Próba 5: Dla starszych wersji, które mogą wymagać Buffer
                    try {
                      instance = new PDFParseClass(buffer);
                    } catch (e5) {
                      const errorMessages = [
                        e1 instanceof Error ? e1.message : String(e1),
                        e2 instanceof Error ? e2.message : String(e2),
                        e3 instanceof Error ? e3.message : String(e3),
                        e4 instanceof Error ? e4.message : String(e4),
                        e5 instanceof Error ? e5.message : String(e5),
                      ].filter(Boolean);
                      throw new Error(`PDFParse nie przyjmuje danych w żadnej formie: ${errorMessages.join(', ')}`);
                    }
                  }
                }
              }
            }
            
            // Jeśli mamy instancję, sprawdź jak z niej wyciągnąć tekst
            if (instance && !data) {
              // Sprawdź czy instancja jest Promise
              if (instance && typeof instance.then === 'function') {
                data = await instance;
              }
              // Sprawdź czy instancja ma metodę parse()
              else if (instance && typeof instance.parse === 'function') {
                data = await instance.parse();
              }
              // Sprawdź czy instancja ma metodę getText()
              else if (instance && typeof instance.getText === 'function') {
                const textResult = await instance.getText();
                // getText() może zwrócić string bezpośrednio lub obiekt z text
                if (typeof textResult === 'string') {
                  data = { text: textResult };
                } else if (textResult && typeof textResult === 'object' && textResult.text) {
                  data = textResult;
                } else {
                  data = { text: textResult };
                }
              }
              // Sprawdź czy instancja ma właściwość text lub data
              else if (instance && (instance.text || instance.data)) {
                data = instance;
              }
              // W przeciwnym razie, może konstruktor zwraca wynik bezpośrednio
              else {
                data = instance;
              }
            }
          }
        } catch (newError: any) {
          logger.error('Błąd użycia PDFParse klasy', {
            error: newError?.message,
            stack: newError?.stack,
            errorName: newError?.name,
          });
          throw newError;
        }
      } else {
        throw new Error('PDFParse nie jest funkcją/klasą');
      }
    }
    // Próba 4: Sprawdź czy to obiekt z właściwością pdfParse (z małej litery)
    else if (pdfParseModule && typeof pdfParseModule.pdfParse === 'function') {
      data = await pdfParseModule.pdfParse(buffer);
    }
    else {
      logger.error('Błąd ładowania pdf-parse', {
        moduleType: typeof pdfParseModule,
        moduleKeys: pdfParseModule ? Object.keys(pdfParseModule) : 'null',
        hasPDFParse: pdfParseModule && 'PDFParse' in pdfParseModule,
        PDFParseType: pdfParseModule?.PDFParse ? typeof pdfParseModule.PDFParse : 'undefined',
      });
      throw new Error(
        'Nie udało się załadować pdf-parse. ' +
        'Sprawdź instalację: npm install pdf-parse. ' +
        'Upewnij się, że pdf-parse jest w serverExternalPackages w next.config.ts. ' +
        'Wersja 2.4.5 wymaga użycia klasy PDFParse zamiast funkcji.'
      );
    }

    // Logowanie diagnostyczne
    let docValue: any = undefined;
    let progressValue: any = undefined;
    try {
      docValue = data?.doc;
      progressValue = data?.progress;
    } catch (e) {
      // Ignoruj błędy dostępu do właściwości
    }
    
    logger.info('PDF Parse - struktura danych', {
      dataType: typeof data,
      dataIsNull: data === null,
      dataIsUndefined: data === undefined,
      dataKeys: data && typeof data === 'object' ? Object.keys(data) : 'not an object',
      hasText: data && 'text' in data,
      textType: data?.text ? typeof data.text : 'undefined',
      textLength: data?.text ? data.text.length : 0,
      hasDoc: data && 'doc' in data,
      docType: docValue ? typeof docValue : 'undefined',
      docIsNull: docValue === null,
      docIsUndefined: docValue === undefined,
      docKeys: docValue && typeof docValue === 'object' && !Array.isArray(docValue) ? Object.keys(docValue) : 'not an object',
      hasProgress: data && 'progress' in data,
      progressType: progressValue ? typeof progressValue : 'undefined',
      hasInfo: data && 'info' in data,
      hasMetadata: data && 'metadata' in data,
      hasNumPages: data && 'numPages' in data,
      // Sprawdź wszystkie metody w data
      dataMethods: data && typeof data === 'object' ? Object.getOwnPropertyNames(data).filter(name => typeof (data as any)[name] === 'function') : [],
    });

    // Sprawdzenie czy PDF zawiera tekst
    // pdf-parse standardowo zwraca obiekt z właściwością 'text'
    let extractedText: string | null = null;

    if (data && typeof data === 'object') {
      // Próba 1: Standardowa właściwość text (główna metoda)
      if (data.text && typeof data.text === 'string' && data.text.trim().length > 0) {
        extractedText = data.text.trim();
      }
      // Próba 2: Sprawdź czy data ma metodę getText()
      else if (typeof data.getText === 'function') {
        try {
          const textResult = await data.getText();
          if (textResult && typeof textResult === 'string' && textResult.trim().length > 0) {
            extractedText = textResult.trim();
          }
        } catch (e) {
          logger.warn('Błąd wywołania data.getText()', { error: e });
        }
      }
      // Próba 3: Jeśli text jest pusty, sprawdź czy doc zawiera tekst
      // (niektóre wersje pdf-parse mogą zwracać tekst w doc)
      else if (data.doc) {
        let doc: any;
        try {
          doc = data.doc;
          // Jeśli doc jest Promise, await
          if (doc && typeof doc.then === 'function') {
            doc = await doc;
          }
        } catch (e) {
          logger.warn('Błąd dostępu do data.doc', { error: e });
          doc = null;
        }
        
        if (doc && typeof doc === 'object') {
          // Sprawdź czy doc ma metodę do wyciągnięcia tekstu
          if (typeof doc.getText === 'function') {
            try {
              const docText = await doc.getText();
              if (docText && typeof docText === 'string' && docText.trim().length > 0) {
                extractedText = docText.trim();
              }
            } catch (e) {
              logger.warn('Błąd wywołania doc.getText()', { error: e });
            }
          }
          
          // Sprawdź czy doc ma metodę getPageText() (pdf.js API)
          if (!extractedText && typeof doc.getPageText === 'function') {
            try {
              const numPages = data.numPages || doc.numPages || 1;
              const pageTexts: string[] = [];
              for (let i = 1; i <= numPages; i++) {
                try {
                  const pageText = await doc.getPageText(i);
                  if (pageText && typeof pageText === 'string' && pageText.trim().length > 0) {
                    pageTexts.push(pageText.trim());
                  }
                } catch (e) {
                  // Ignoruj błędy pojedynczych stron
                }
              }
              if (pageTexts.length > 0) {
                extractedText = pageTexts.join(' ');
              }
            } catch (e) {
              logger.warn('Błąd wywołania doc.getPageText()', { error: e });
            }
          }
          
          // Sprawdź czy doc ma właściwość text
          if (!extractedText && doc.text && typeof doc.text === 'string' && doc.text.trim().length > 0) {
            extractedText = doc.text.trim();
          }
          
          // Sprawdź czy doc ma items (struktura z pdf.js)
          if (!extractedText && doc.items && Array.isArray(doc.items)) {
            const itemsText = doc.items
              .map((item: any) => {
                if (item && typeof item === 'object') {
                  // pdf.js items mają właściwość 'str' dla tekstu
                  return item.str || item.text || '';
                }
                return '';
              })
              .filter((text: string) => text.trim().length > 0)
              .join(' ');
            
            if (itemsText.trim().length > 0) {
              extractedText = itemsText.trim();
            }
          }
          
          // Sprawdź czy doc ma pages
          if (!extractedText && doc.pages && Array.isArray(doc.pages)) {
            const pagesText = doc.pages
              .map((page: any) => {
                if (typeof page === 'string') return page;
                if (page && typeof page === 'object') {
                  return page.text || page.content || page.getText?.() || '';
                }
                return '';
              })
              .filter((text: string) => text.trim().length > 0)
              .join(' ');
            
            if (pagesText.trim().length > 0) {
              extractedText = pagesText.trim();
            }
          }
          
          // Sprawdź czy doc ma contentItems (inna struktura pdf.js)
          if (!extractedText && doc.contentItems && Array.isArray(doc.contentItems)) {
            const contentText = doc.contentItems
              .map((item: any) => {
                if (item && typeof item === 'object') {
                  return item.str || item.text || item.content || '';
                }
                return '';
              })
              .filter((text: string) => text.trim().length > 0)
              .join(' ');
            
            if (contentText.trim().length > 0) {
              extractedText = contentText.trim();
            }
          }
        }
      }
      // Próba 4: Sprawdź czy data ma content
      else if (data.content && typeof data.content === 'string' && data.content.trim().length > 0) {
        extractedText = data.content.trim();
      }
      // Próba 5: Sprawdź czy data ma result
      else if (data.result && typeof data.result === 'string' && data.result.trim().length > 0) {
        extractedText = data.result.trim();
      }
      // Próba 6: Sprawdź czy data to bezpośrednio string
      else if (typeof data === 'string' && data.trim().length > 0) {
        extractedText = data.trim();
      }
    }

    if (!extractedText || extractedText.trim().length === 0) {
      // Dodatkowe logowanie dla diagnostyki
      // Jeśli mamy doc, spróbujmy wyciągnąć z niego więcej informacji
      let docDetails: any = {};
      if (data?.doc) {
        try {
          const doc = data.doc;
          if (doc && typeof doc === 'object') {
            docDetails = {
              docType: typeof doc,
              docKeys: Object.keys(doc),
              docConstructor: doc.constructor?.name,
              hasGetText: typeof doc.getText === 'function',
              hasItems: Array.isArray(doc.items),
              itemsLength: Array.isArray(doc.items) ? doc.items.length : 0,
              hasPages: Array.isArray(doc.pages),
              pagesLength: Array.isArray(doc.pages) ? doc.pages.length : 0,
            };
          }
        } catch (e) {
          docDetails = { error: String(e) };
        }
      }
      
      logger.error('PDF nie zawiera tekstu w żadnej znanej właściwości', {
        dataKeys: data && typeof data === 'object' ? Object.keys(data) : 'not an object',
        dataType: typeof data,
        hasText: data && 'text' in data,
        textValue: data?.text ? (typeof data.text === 'string' ? `"${data.text.substring(0, 100)}..."` : String(data.text)) : 'undefined',
        numPages: data?.numPages,
        info: data?.info ? JSON.stringify(data.info).substring(0, 200) : 'undefined',
        docDetails,
      });
      throw new Error(
        'PDF nie zawiera tekstu w formacie, który można wyciągnąć. ' +
        'Prawdopodobnie jest to skan (obrazy) lub tekst jest w niestandardowym formacie. ' +
        'Wymaga OCR, co nie jest obsługiwane. Możesz wkleić tekst ręcznie w formularzu YouTube.'
      );
    }

    return extractedText;
  } catch (error) {
    logger.error('Błąd parsowania PDF', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
}

/**
 * Interfejs dla pytania quizu
 */
export interface QuizQuestion {
  pytanie: string;
  odpowiedzi: string[];
  poprawna_odpowiedz: number; // Indeks poprawnej odpowiedzi (0-3)
  uzasadnienie?: string; // Opcjonalne uzasadnienie odpowiedzi
}

/**
 * Interfejs dla całego quizu
 */
export interface Quiz {
  pytania: QuizQuestion[];
}

/**
 * Funkcja pomocnicza do bezpiecznego czyszczenia kluczy i wartości w obiekcie
 * Rekurencyjnie przechodzi przez obiekt i normalizuje wszystkie klucze i stringi
 * Używana PO parsowaniu JSON, aby uniknąć uszkodzenia struktury JSON
 */
function cleanObjectKeys(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(v => cleanObjectKeys(v));
  }
  
  if (typeof obj === 'object') {
    return Object.keys(obj).reduce((acc: any, key) => {
      // Normalizacja klucza:
      // 1. Usuwamy tagi HTML
      // 2. Usuwamy podkreślniki z początku i końca
      // 3. Usuwamy gwiazdki i inne markdown
      // 4. Trim whitespace
      let cleanKey = key
        .replace(/<[^>]*>/g, '') // HTML tags
        .replace(/^[_*]+|[_*]+$/g, '') // Podkreślniki i gwiazdki na początku/końcu
        .trim();
      
      // Rekurencyjnie czyścimy wartości
      const value = obj[key];
      let cleanValue = value;
      
      // Jeśli wartość to string, normalizujemy go też
      if (typeof value === 'string') {
        cleanValue = value
          .replace(/^[_*]+|[_*]+$/g, '') // Podkreślniki i gwiazdki na początku/końcu
          .replace(/^\.|\.$/g, '') // Kropki na początku/końcu
          .trim();
      } else {
        cleanValue = cleanObjectKeys(value);
      }
      
      acc[cleanKey] = cleanValue;
      return acc;
    }, {});
  }
  
  // Dla wartości pierwotnych (stringów) czyścimy też
  if (typeof obj === 'string') {
    return obj
      .replace(/^[_*]+|[_*]+$/g, '') // Podkreślniki i gwiazdki
      .replace(/^\.|\.$/g, '') // Kropki na początku/końcu
      .trim();
  }
  
  return obj;
}

/**
 * Funkcja pomocnicza do losowego mieszania tablicy (Fisher-Yates shuffle)
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Wykrywa czy materiał dotyczy nauki języka obcego używając OpenAI
 * @param text - Fragment tekstu do analizy (pierwsze ~2000 znaków wystarczą)
 * @returns Obiekt z informacją czy to materiał językowy oraz opcjonalnie język docelowy
 */
async function detectLanguageLearningMaterial(text: string): Promise<{
  isLanguageLearning: boolean;
  targetLanguage?: string;
  details?: string;
}> {
  try {
    // Użyj tylko fragmentu tekstu dla oszczędności (pierwsze 2000 znaków wystarczą do analizy)
    const textSample = text.substring(0, 2000);
    
    const openaiClient = getOpenAI();
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Jesteś ekspertem w analizie materiałów edukacyjnych. Twoje zadanie to określić czy dany tekst dotyczy nauki języka obcego. Odpowiadasz TYLKO w formacie JSON.',
        },
        {
          role: 'user',
          content: `Przeanalizuj poniższy fragment tekstu i określ:
1. Czy ten materiał dotyczy nauki języka obcego (np. lekcja gramatyki, słownictwa, konwersacji)?
2. Jeśli tak, jakiego języka dotyczy nauka?

Materiał dotyczy nauki języka obcego jeśli:
- Uczy słownictwa, gramatyki, wymowy w obcym języku
- Zawiera tłumaczenia słów/zwrotów między językami
- Wyjaśnia konstrukcje językowe, czasy, deklinacje
- Prezentuje zwroty konwersacyjne w obcym języku
- Uczy komunikacji w języku obcym (gastronomia, biznes, podróże itp.)

Materiał NIE dotyczy nauki języka jeśli:
- To ogólny film dokumentalny, wykład, prezentacja (nawet jeśli wspomina języki)
- To film o historii, nauce, technologii (nawet jeśli ma obce słowa)
- To literatura, poezja, sztuka (chyba że analizuje język)

Zwróć odpowiedź w formacie JSON:
{
  "isLanguageLearning": true/false,
  "targetLanguage": "nazwa języka" (np. "angielski", "hiszpański", "niemiecki") lub null jeśli to nie materiał językowy,
  "confidence": "low"/"medium"/"high",
  "details": "krótkie uzasadnienie decyzji (1-2 zdania)"
}

Nie dodawaj markdown. Zwróć TYLKO czysty JSON.

Tekst do analizy:
"""
${textSample}
"""`,
        },
      ],
      temperature: 0.3, // Niska temperatura dla konsystentnych odpowiedzi
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      logger.warn('Brak odpowiedzi z OpenAI przy wykrywaniu materiału językowego');
      return { isLanguageLearning: false };
    }

    const result = JSON.parse(responseText);
    
    logger.info('Wykryto typ materiału', {
      isLanguageLearning: result.isLanguageLearning,
      targetLanguage: result.targetLanguage,
      confidence: result.confidence,
      details: result.details,
    });

    return {
      isLanguageLearning: result.isLanguageLearning || false,
      targetLanguage: result.targetLanguage || undefined,
      details: result.details || undefined,
    };
  } catch (error) {
    logger.error('Błąd wykrywania typu materiału', {
      error: error instanceof Error ? error.message : String(error),
    });
    // W przypadku błędu, zakładamy że to nie materiał językowy (graceful degradation)
    return { isLanguageLearning: false };
  }
}

/**
 * Generuje quiz z tekstu używając OpenAI GPT-4o-mini
 * Zaimplementowano:
 * 1. Automatyczne wykrywanie materiałów językowych
 * 2. Prosty, precyzyjny prompt z konkretnym przykładem JSON
 * 3. Agresywną normalizację i walidację
 * 4. Fallbacki dla różnych wariantów kluczy
 * 
 * @param text - Tekst źródłowy (transkrypt lub treść PDF)
 * @returns Obiekt quizu z 10 pytaniami lub null w przypadku błędu
 */
export async function generateQuiz(text: string): Promise<Quiz | null> {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error('Tekst źródłowy jest pusty');
    }

    // Walidacja rozmiaru tekstu przed wysłaniem do OpenAI
    const MAX_TOKENS = 128000;
    const TOKEN_TO_CHAR_RATIO = 4;
    const RESERVED_TOKENS = 10000;
    const MAX_CHARS = (MAX_TOKENS - RESERVED_TOKENS) * TOKEN_TO_CHAR_RATIO;

    if (text.length > MAX_CHARS) {
      throw new Error(
        `Tekst jest zbyt długi (${text.length} znaków). Maksimum: ${MAX_CHARS} znaków.`
      );
    }

    // Generuj losowy seed dla różnorodności
    const randomSeed = Math.random().toString(36).substring(2, 10);

    // Wykryj czy materiał dotyczy nauki języka obcego
    logger.info('Wykrywanie typu materiału (językowy vs ogólny)...');
    const materialAnalysis = await detectLanguageLearningMaterial(text);
    const isLanguageLearning = materialAnalysis.isLanguageLearning;
    const targetLanguage = materialAnalysis.targetLanguage;

    // Przygotuj instrukcje dla materiałów językowych
    let languageInstructions = '';
    if (isLanguageLearning && targetLanguage) {
      languageInstructions = `

WAŻNE: Ten materiał dotyczy nauki języka obcego (${targetLanguage}).

Pytania MUSZĄ dotyczyć:
- Znaczenia słów i zwrotów w języku obcym
- Tłumaczeń między polskim a ${targetLanguage}
- Użycia słownictwa w kontekście
- Konstrukcji gramatycznych z materiału

NIE pytaj o:
- Ogólny klimat lub nastrój materiału
- Kontekst tworzenia materiału
- Historie lub kulturę (chyba że bezpośrednio związane z językiem)

Przykład dobrego pytania: "Co oznacza zwrot '[konkretny zwrot z tekstu]'?"
Przykład złego pytania: "Jaki jest ogólny klimat tego materiału?"
`;
    }

    // Prosty, precyzyjny prompt z konkretnym przykładem
    const prompt = `Przygotuj quiz edukacyjny na podstawie poniższego tekstu.${languageInstructions}

WYMAGANIA:
1. Wygeneruj DOKŁADNIE 10 pytań wielokrotnego wyboru
2. Każde pytanie ma 4 odpowiedzi (A, B, C, D), tylko jedna poprawna
3. Dodaj uzasadnienie do każdej odpowiedzi (2-3 zdania)
4. Pytania muszą sprawdzać ZROZUMIENIE materiału

IDENTYFIKATOR LOSOWY: ${randomSeed} - użyj go do wyboru różnorodnych tematów z tekstu.

STRUKTURA JSON (DOKŁADNIE TAKA):
{
  "pytania": [
    {
      "pytanie": "Treść pytania bez żadnych dekoracji?",
      "odpowiedzi": [
        "Pierwsza odpowiedź",
        "Druga odpowiedź",
        "Trzecia odpowiedź",
        "Czwarta odpowiedź"
      ],
      "poprawna_odpowiedz": 0,
      "uzasadnienie": "Wyjaśnienie dlaczego odpowiedź jest poprawna"
    }
  ]
}

KRYTYCZNE ZASADY:
- Zwróć TYLKO czysty JSON, bez markdown code blocks ani innych znaczników
- Klucze JSON bez podkreślników, gwiazdek, tagów HTML: "pytanie" a NIE "_pytanie_"
- Odpowiedzi bez kropek na początku: "Ma kaszel" a NIE ".Ma kaszel"
- Teksty bez dekoracji markdown: "tekst" a NIE "_tekst_" ani "**tekst**"
- Użyj klucza "uzasadnienie" a NIE "uzasadnienia"

TEKST ŹRÓDŁOWY:
"""
${text}
"""`;

    const openaiClient = getOpenAI();
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Jesteś ekspertem od tworzenia quizów edukacyjnych. ' +
            'ZAWSZE zwracasz TYLKO czysty, poprawny JSON bez żadnych dodatkowych oznaczeń. ' +
            'NIGDY nie używaj markdown, podkreślników, gwiazdek ani tagów HTML w kluczach JSON. ' +
            'Klucze muszą być proste: "pytanie", "odpowiedzi", "poprawna_odpowiedz", "uzasadnienie". ' +
            'Odpowiedzi nie mogą zaczynać się od kropek. ' +
            'Output: strict JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.5, // Niska temperatura dla konsystentnej struktury
      frequency_penalty: 0.3,
      presence_penalty: 0.5,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('Brak odpowiedzi z OpenAI');
    }

    // Wyciągnij JSON
    let jsonText = responseText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }

    // Parsuj JSON
    let quiz: any;
    try {
      quiz = JSON.parse(jsonText);
    } catch (parseError) {
      logger.error('Błąd parsowania JSON z OpenAI', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        jsonTextSample: jsonText.substring(0, 500),
      });
      throw new Error(
        `Błąd parsowania JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
    }

    // Czyść klucze i wartości (usuwa podkreślniki, kropki, markdown)
    if (quiz && typeof quiz === 'object') {
      quiz = cleanObjectKeys(quiz);
    }

    // Normalizuj klucze na najwyższym poziomie (fallback dla różnych wariantów)
    const normalizedQuiz: any = {};
    for (const key of Object.keys(quiz)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
      if (normalizedKey === 'pytania' || normalizedKey === 'questions') {
        normalizedQuiz.pytania = quiz[key];
      } else {
        normalizedQuiz[key] = quiz[key];
      }
    }
    quiz = normalizedQuiz;

    // Walidacja struktury
    if (!quiz.pytania || !Array.isArray(quiz.pytania)) {
      logger.error('Nieprawidłowa struktura quizu', {
        quizKeys: Object.keys(quiz),
        pytaniaType: typeof quiz.pytania,
      });
      throw new Error('Nieprawidłowa struktura quizu - brak tablicy pytań');
    }

    if (quiz.pytania.length === 0) {
      throw new Error('Quiz nie zawiera żadnych pytań');
    }

    // Utwórz finalny quiz
    const finalQuiz: Quiz = {
      pytania: quiz.pytania,
    };

    // Walidacja i normalizacja każdego pytania
    for (let i = 0; i < finalQuiz.pytania.length; i++) {
      let pytanie = finalQuiz.pytania[i];
      
      if (!pytanie || typeof pytanie !== 'object') {
        logger.error('Pytanie jest null lub undefined', { index: i });
        throw new Error(`Pytanie #${i + 1} jest null lub undefined`);
      }

      // Normalizuj klucze pytania (fallback dla różnych wariantów)
      const normalizedQuestion: any = {};
      for (const key of Object.keys(pytanie)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z_]/g, '');
        
        // Mapuj różne warianty kluczy na standardowe
        if (normalizedKey === 'pytanie' || normalizedKey === 'question') {
          normalizedQuestion.pytanie = (pytanie as any)[key];
        } else if (normalizedKey === 'odpowiedzi' || normalizedKey === 'answers') {
          normalizedQuestion.odpowiedzi = (pytanie as any)[key];
        } else if (normalizedKey === 'poprawnaodpowiedz' || normalizedKey === 'poprawna_odpowiedz' || normalizedKey === 'correctanswer' || normalizedKey === 'correct_answer') {
          normalizedQuestion.poprawna_odpowiedz = (pytanie as any)[key];
        } else if (normalizedKey === 'uzasadnienie' || normalizedKey === 'uzasadnienia' || normalizedKey === 'explanation' || normalizedKey === 'justification') {
          normalizedQuestion.uzasadnienie = (pytanie as any)[key];
        } else {
          normalizedQuestion[key] = (pytanie as any)[key];
        }
      }
      pytanie = normalizedQuestion;
      finalQuiz.pytania[i] = pytanie;
      
      // Walidacja pól
      const hasQuestion = pytanie.pytanie && typeof pytanie.pytanie === 'string' && pytanie.pytanie.trim().length > 0;
      const hasAnswers = pytanie.odpowiedzi && Array.isArray(pytanie.odpowiedzi);
      const hasCorrectAnswer = typeof pytanie.poprawna_odpowiedz === 'number';
      
      if (!hasQuestion || !hasAnswers) {
        logger.error('Nieprawidłowa struktura pytania', {
          index: i,
          pytanieKeys: Object.keys(pytanie),
          hasQuestion,
          hasAnswers,
          fullQuestion: JSON.stringify(pytanie, null, 2),
        });
        throw new Error(
          `Nieprawidłowa struktura pytania #${i + 1}. ` +
          `Brak wymaganych pól (pytanie lub odpowiedzi).`
        );
      }
      
      // Walidacja liczby odpowiedzi
      if (!Array.isArray(pytanie.odpowiedzi) || pytanie.odpowiedzi.length !== 4) {
        logger.error('Nieprawidłowa liczba odpowiedzi', {
          index: i,
          expected: 4,
          actual: pytanie.odpowiedzi?.length || 0,
          answers: pytanie.odpowiedzi,
        });
        throw new Error(
          `Pytanie #${i + 1} ma ${pytanie.odpowiedzi?.length || 0} odpowiedzi zamiast 4. ` +
          `OpenAI zwróciło nieprawidłowy format.`
        );
      }
      
      // Walidacja treści odpowiedzi
      for (let j = 0; j < pytanie.odpowiedzi.length; j++) {
        const odpowiedz = pytanie.odpowiedzi[j];
        
        // Konwertuj na string jeśli trzeba
        if (typeof odpowiedz !== 'string') {
          pytanie.odpowiedzi[j] = String(odpowiedz);
        }
        
        // Sprawdź czy nie jest pusta
        if (!pytanie.odpowiedzi[j] || pytanie.odpowiedzi[j].trim().length === 0) {
          logger.error('Pusta odpowiedź', {
            questionIndex: i,
            answerIndex: j,
          });
          throw new Error(
            `Pytanie #${i + 1}, odpowiedź #${j + 1} jest pusta.`
          );
        }
        
        // Usuń kropki z początku (częsty problem)
        pytanie.odpowiedzi[j] = pytanie.odpowiedzi[j].replace(/^\s*\.+\s*/, '').trim();
      }
      
      // Walidacja indeksu poprawnej odpowiedzi
      if (!hasCorrectAnswer || pytanie.poprawna_odpowiedz < 0 || pytanie.poprawna_odpowiedz > 3) {
        logger.error('Nieprawidłowy indeks poprawnej odpowiedzi', {
          index: i,
          poprawna_odpowiedz: pytanie.poprawna_odpowiedz,
        });
        throw new Error(
          `Pytanie #${i + 1}: nieprawidłowy indeks poprawnej odpowiedzi (${pytanie.poprawna_odpowiedz}). ` +
          `Oczekiwano 0-3.`
        );
      }
      
      // Konwertuj uzasadnienie na string jeśli istnieje
      if (pytanie.uzasadnienie !== undefined && typeof pytanie.uzasadnienie !== 'string') {
        pytanie.uzasadnienie = String(pytanie.uzasadnienie);
      }
    }

    return finalQuiz;
  } catch (error) {
    logger.error('Błąd generowania quizu', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
}

/**
 * Waliduje i czyści ręcznie wklejony tekst (fallback gdy automatyczne pobieranie nie działa)
 * @param text - Tekst wklejony ręcznie przez administratora
 * @returns Oczyszczony i zwalidowany tekst lub null jeśli tekst jest nieprawidłowy
 */
export async function processManualText(text: string): Promise<string | null> {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Usuń nadmiarowe białe znaki (spacje, tabulatory, nowe linie)
  let cleaned = text.trim();

  // Sprawdź minimalną długość (np. 100 znaków - zbyt krótki tekst nie wystarczy na quiz)
  const MIN_LENGTH = 100;
  if (cleaned.length < MIN_LENGTH) {
    logger.warn(`Tekst jest zbyt krótki: ${cleaned.length} znaków (minimum: ${MIN_LENGTH})`);
    return null;
  }

  // Normalizuj białe znaki - zamień wiele spacji/tabulatorów na pojedyncze spacje
  cleaned = cleaned.replace(/\s+/g, ' ');

  // Usuń znaki kontrolne (oprócz nowych linii, które mogą być ważne dla struktury)
  cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Sprawdź maksymalną długość (aby uniknąć zbyt długich tekstów)
  const MAX_LENGTH = 500000; // ~500k znaków (bezpieczny limit dla OpenAI)
  if (cleaned.length > MAX_LENGTH) {
    logger.warn(`Tekst jest zbyt długi: ${cleaned.length} znaków (maksimum: ${MAX_LENGTH})`);
    // Obetnij do maksymalnej długości
    cleaned = cleaned.substring(0, MAX_LENGTH);
  }

  return cleaned;
}

/**
 * Hybrydowe podejście: próbuje automatycznie pobrać transkrypt z YouTube,
 * jeśli nie działa, próbuje przez Groq API (ASR), jeśli to też nie działa,
 * zwraca informację o potrzebie ręcznego wklejenia
 * @param url - URL wideo YouTube
 * @param startSeconds - Czas startu w sekundach
 * @param endSeconds - Czas końca w sekundach (opcjonalnie)
 * @returns Obiekt z wynikiem: { success: boolean, transcript: string | null, requiresManual: boolean, error?: string, method?: 'youtube' | 'groq' }
 */
export async function getYouTubeTranscriptHybrid(
  url: string,
  startSeconds: number = 0,
  endSeconds?: number
): Promise<{
  success: boolean;
  transcript: string | null;
  requiresManual: boolean;
  error?: string;
  method?: 'youtube' | 'groq';
}> {
  // KROK 1: Próba automatyczna z YouTube (najszybsze, darmowe)
  logger.info('Próba pobrania transkryptu z YouTube', { url, startSeconds, endSeconds });
  const youtubeTranscript = await getYouTubeTranscript(url, startSeconds, endSeconds);

  if (youtubeTranscript) {
    logger.info('Transkrypt pobrany z YouTube', { url, length: youtubeTranscript.length });
    return {
      success: true,
      transcript: youtubeTranscript,
      requiresManual: false,
      method: 'youtube',
    };
  }

  // KROK 2: Jeśli YouTube nie działa, próbuj przez Groq API (ASR)
  logger.info('Transkrypt z YouTube niedostępny, próba przez Groq API', { url, startSeconds, endSeconds });
  
  try {
    const groqTranscript = await getYouTubeTranscriptWithGroq(url, startSeconds, endSeconds);
    
    if (groqTranscript) {
      logger.info('Transkrypt pobrany przez Groq API', { url, length: groqTranscript.length });
      return {
        success: true,
        transcript: groqTranscript,
        requiresManual: false,
        method: 'groq',
      };
    }
  } catch (groqError) {
    logger.warn('Błąd transkrypcji przez Groq API', {
      error: groqError instanceof Error ? groqError.message : String(groqError),
      url,
    });
    // Kontynuuj do fallback ręcznego
  }

  // KROK 3: Jeśli obie metody nie zadziałały, zwróć informację o potrzebie ręcznego wklejenia
  logger.warn('Wszystkie metody automatyczne nie powiodły się, wymagane ręczne wklejenie', { url });
  return {
    success: false,
    transcript: null,
    requiresManual: true,
    error:
      '⚠️ YouTube zablokowało automatyczne pobieranie tego filmu.\n\n' +
      '📝 Proszę wkleić transkrypt ręcznie poniżej.\n\n' +
      '💡 Jak uzyskać transkrypt:\n' +
      '1. Otwórz film na YouTube\n' +
      '2. Kliknij "..." pod filmem → "Pokaż transkrypcję"\n' +
      '3. Skopiuj cały tekst i wklej poniżej\n\n' +
      'Pole do wklejenia pojawi się za chwilę...',
  };
}

