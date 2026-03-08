'use server';

import { Innertube } from 'youtubei.js';
import OpenAI from 'openai';
import { extractVideoId } from './utils';
import { logger } from './logger';
import { getYouTubeTranscriptWithGroq } from './groq-transcription';

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set in environment variables. Check your .env.local file.'
    );
  }
  return new OpenAI({ apiKey });
}

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    openai = getOpenAIClient();
  }
  return openai;
}

/** Fetches YouTube transcript and filters segments to the given time range. Returns joined text or null on error. */
export async function getYouTubeTranscript(
  url: string,
  startSeconds: number = 0,
  endSeconds?: number
): Promise<string | null> {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    const youtube = await Innertube.create();
    
    let info;
    try {
      info = await youtube.getInfo(videoId);
    } catch (infoError: any) {
      logger.warn('Failed to fetch YouTube video info', {
        url,
        videoId,
        error: infoError?.message || String(infoError),
        errorName: infoError?.name,
      });
      throw infoError;
    }
    
    let transcriptData;
    try {
      transcriptData = await info.getTranscript();
    } catch (transcriptError: any) {
      // YouTube.js errors have date, version, info structure
      const isParserError =
        transcriptError?.name === 'ParserError' ||
        transcriptError?.info !== undefined ||
        transcriptError?.message?.includes('Type mismatch') ||
        transcriptError?.message?.includes('Parser');
      
      if (isParserError) {
        logger.warn('YouTube.js: Transcript parser error (normal for some videos)', {
          url,
          videoId,
          error: transcriptError?.message || String(transcriptError),
          errorName: transcriptError?.name,
          errorDate: transcriptError?.date,
          errorVersion: transcriptError?.version,
          errorInfo: transcriptError?.info,
        });
      } else {
        logger.error('Failed to fetch YouTube transcript', {
          url,
          videoId,
          error: transcriptError?.message || String(transcriptError),
          errorName: transcriptError?.name,
          stack: transcriptError?.stack,
        });
      }
      throw transcriptError;
    }

    if (!transcriptData?.transcript?.content?.body?.initial_segments) {
      throw new Error('Transcript is not available for this video');
    }

    const segments = transcriptData.transcript.content.body.initial_segments.map(
      (seg: any) => ({
        text: seg.snippet.text,
        start: seg.snippet.start_ms || 0,
        duration: seg.snippet.duration_ms || 0,
      })
    );

    const startMs = startSeconds * 1000;
    const endMs = endSeconds !== undefined ? endSeconds * 1000 : undefined;
    
    const filteredSegments = segments.filter((seg: any) => {
      const segmentEnd = seg.start + seg.duration;
      if (segmentEnd < startMs) {
        return false;
      }
      if (endMs !== undefined && seg.start >= endMs) {
        return false;
      }
      return true;
    });

    if (filteredSegments.length === 0) {
      const rangeDesc = endSeconds !== undefined 
        ? `in range ${startSeconds}s - ${endSeconds}s` 
        : `after ${startSeconds}s`;
      throw new Error(`No transcript segments ${rangeDesc}`);
    }

    const transcript = filteredSegments.map((seg: any) => seg.text).join(' ');

    return transcript;
  } catch (error: any) {
    // YouTube.js errors have date/version/info structure; parser errors are common for some videos
    const isParserError =
      error?.message?.includes('Type mismatch') ||
      error?.message?.includes('Parser') ||
      error?.name === 'ParserError' ||
      (error?.info && typeof error.info === 'object');

    if (isParserError) {
      logger.warn('YouTube.js: Could not parse video structure (normal for some videos)', {
        url,
        error: error?.message || String(error),
        errorName: error?.name,
        errorDate: error?.date,
        errorVersion: error?.version,
      });
    } else {
      logger.error('Failed to fetch YouTube transcript', {
        url,
        error: error?.message || String(error),
        errorName: error?.name,
        stack: error?.stack,
        fullError: error,
      });
    }
    return null; // Signals UI to show manual paste field
  }
}

/** Extracts text from a PDF file. Returns null on error. */
export async function parsePDF(file: File): Promise<string | null> {
  try {
    // pdf-parse requires browser APIs (DOMMatrix, ImageData, Path2D) not available in Node.js
    if (typeof global !== 'undefined' && typeof global.DOMMatrix === 'undefined') {
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
            if (typeof init === 'string') {
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

      if (typeof global.Path2D === 'undefined') {
        (global as any).Path2D = class Path2DPolyfill {
          constructor(path?: string | Path2DPolyfill) {}
          moveTo(x: number, y: number): void {}
          lineTo(x: number, y: number): void {}
          arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void {}
          closePath(): void {}
        };
      }

      (global as any).DOMMatrix = DOMMatrixPolyfill;
    }

    // Lazy loading; pdf-parse is CommonJS; add to serverExternalPackages in next.config
    const pdfParseModule = require('pdf-parse');
    
    // pdf-parse 2.4.5 expects Uint8Array; older versions may need Buffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const buffer = Buffer.from(arrayBuffer);

    let data: any;
    
    if (typeof pdfParseModule === 'function') {
      try {
        data = await pdfParseModule(uint8Array);
      } catch (e) {
        data = await pdfParseModule(buffer);
      }
    }
    else if (pdfParseModule && typeof pdfParseModule.default === 'function') {
      try {
        data = await pdfParseModule.default(uint8Array);
      } catch (e) {
        data = await pdfParseModule.default(buffer);
      }
    }
    else if (pdfParseModule && pdfParseModule.PDFParse) {
      const PDFParseClass = pdfParseModule.PDFParse;
      if (typeof PDFParseClass === 'function') {
        try {
          if (typeof PDFParseClass.parse === 'function') {
            try {
              data = await PDFParseClass.parse(uint8Array);
            } catch (e) {
              data = await PDFParseClass.parse(buffer);
            }
          }
          else {
            let instance: any;
            
            try {
              instance = PDFParseClass(uint8Array);
              if (instance && typeof instance.then === 'function') {
                instance = await instance;
              }
            } catch (e1) {
              try {
                instance = new PDFParseClass(uint8Array);
              } catch (e2) {
                try {
                  instance = new PDFParseClass({ data: uint8Array });
                } catch (e3) {
                  try {
                    instance = new PDFParseClass({ buffer: uint8Array });
                  } catch (e4) {
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
                      throw new Error(`PDFParse does not accept data in any format: ${errorMessages.join(', ')}`);
                    }
                  }
                }
              }
            }
            
            if (instance && !data) {
              if (instance && typeof instance.then === 'function') {
                data = await instance;
              }
              else if (instance && typeof instance.parse === 'function') {
                data = await instance.parse();
              }
              else if (instance && typeof instance.getText === 'function') {
                const textResult = await instance.getText();
                if (typeof textResult === 'string') {
                  data = { text: textResult };
                } else if (textResult && typeof textResult === 'object' && textResult.text) {
                  data = textResult;
                } else {
                  data = { text: textResult };
                }
              }
              else if (instance && (instance.text || instance.data)) {
                data = instance;
              }
              else {
                data = instance;
              }
            }
          }
        } catch (newError: any) {
          logger.error('Failed to use PDFParse class', {
            error: newError?.message,
            stack: newError?.stack,
            errorName: newError?.name,
          });
          throw newError;
        }
      } else {
        throw new Error('PDFParse is not a function/class');
      }
    }
    else if (pdfParseModule && typeof pdfParseModule.pdfParse === 'function') {
      data = await pdfParseModule.pdfParse(buffer);
    }
    else {
      logger.error('Failed to load pdf-parse', {
        moduleType: typeof pdfParseModule,
        moduleKeys: pdfParseModule ? Object.keys(pdfParseModule) : 'null',
        hasPDFParse: pdfParseModule && 'PDFParse' in pdfParseModule,
        PDFParseType: pdfParseModule?.PDFParse ? typeof pdfParseModule.PDFParse : 'undefined',
      });
      throw new Error(
        'Failed to load pdf-parse. ' +
        'Check installation: npm install pdf-parse. ' +
        'Ensure pdf-parse is included in serverExternalPackages in next.config.ts. ' +
        'Version 2.4.5 may require using the PDFParse class instead of a function.'
      );
    }

    let docValue: any = undefined;
    let progressValue: any = undefined;
    try {
      docValue = data?.doc;
      progressValue = data?.progress;
    } catch (e) {
      // ignore access errors
    }
    
    logger.info('PDF Parse - data structure', {
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
      dataMethods: data && typeof data === 'object' ? Object.getOwnPropertyNames(data).filter(name => typeof (data as any)[name] === 'function') : [],
    });

    let extractedText: string | null = null;

    if (data && typeof data === 'object') {
      if (data.text && typeof data.text === 'string' && data.text.trim().length > 0) {
        extractedText = data.text.trim();
      }
      else if (typeof data.getText === 'function') {
        try {
          const textResult = await data.getText();
          if (textResult && typeof textResult === 'string' && textResult.trim().length > 0) {
            extractedText = textResult.trim();
          }
        } catch (e) {
          logger.warn('Failed to call data.getText()', { error: e });
        }
      }
      else if (data.doc) {
        let doc: any;
        try {
          doc = data.doc;
          if (doc && typeof doc.then === 'function') {
            doc = await doc;
          }
        } catch (e) {
          logger.warn('Failed to access data.doc', { error: e });
          doc = null;
        }
        
        if (doc && typeof doc === 'object') {
          if (typeof doc.getText === 'function') {
            try {
              const docText = await doc.getText();
              if (docText && typeof docText === 'string' && docText.trim().length > 0) {
                extractedText = docText.trim();
              }
            } catch (e) {
              logger.warn('Failed to call doc.getText()', { error: e });
            }
          }
          
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
                  // ignore per-page errors
                }
              }
              if (pageTexts.length > 0) {
                extractedText = pageTexts.join(' ');
              }
            } catch (e) {
              logger.warn('Failed to call doc.getPageText()', { error: e });
            }
          }
          
          if (!extractedText && doc.text && typeof doc.text === 'string' && doc.text.trim().length > 0) {
            extractedText = doc.text.trim();
          }
          
          if (!extractedText && doc.items && Array.isArray(doc.items)) {
            const itemsText = doc.items
              .map((item: any) => {
                if (item && typeof item === 'object') {
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
      else if (data.content && typeof data.content === 'string' && data.content.trim().length > 0) {
        extractedText = data.content.trim();
      }
      else if (data.result && typeof data.result === 'string' && data.result.trim().length > 0) {
        extractedText = data.result.trim();
      }
      else if (typeof data === 'string' && data.trim().length > 0) {
        extractedText = data.trim();
      }
    }

    if (!extractedText || extractedText.trim().length === 0) {
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
      
      logger.error('PDF contains no text in any known field', {
        dataKeys: data && typeof data === 'object' ? Object.keys(data) : 'not an object',
        dataType: typeof data,
        hasText: data && 'text' in data,
        textValue: data?.text ? (typeof data.text === 'string' ? `"${data.text.substring(0, 100)}..."` : String(data.text)) : 'undefined',
        numPages: data?.numPages,
        info: data?.info ? JSON.stringify(data.info).substring(0, 200) : 'undefined',
        docDetails,
      });
      throw new Error(
        'This PDF does not contain extractable text. ' +
        'It is likely a scan (images) or uses a non-standard text layer. ' +
        'OCR is not supported. You can paste text manually in the YouTube form.'
      );
    }

    return extractedText;
  } catch (error) {
    logger.error('PDF parsing failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
}

/**
 * Quiz question (canonical English schema).
 * Note: We still accept legacy Polish keys from older data / LLM outputs
 * and normalize them to this schema in `generateQuiz`.
 */
export interface QuizQuestion {
  question: string;
  answers: string[];
  correct_answer: number; // Index of the correct answer (0-3)
  explanation?: string; // Optional explanation (2-3 sentences)
}

/**
 * Quiz (canonical English schema).
 */
export interface Quiz {
  questions: QuizQuestion[];
}

/** Recursively normalizes keys and string values (removes HTML, underscores, markdown). Used after JSON parse. */
function cleanObjectKeys(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(v => cleanObjectKeys(v));
  }
  
  if (typeof obj === 'object') {
    return Object.keys(obj).reduce((acc: any, key) => {
      const cleanKey = key
        .replace(/<[^>]*>/g, '')
        .replace(/^[_*]+|[_*]+$/g, '')
        .trim();
      
      const value = obj[key];
      let cleanValue = value;
      
      if (typeof value === 'string') {
        cleanValue = value
          .replace(/^[_*]+|[_*]+$/g, '')
          .replace(/^\.|\.$/g, '')
          .trim();
      } else {
        cleanValue = cleanObjectKeys(value);
      }
      
      acc[cleanKey] = cleanValue;
      return acc;
    }, {});
  }
  
  if (typeof obj === 'string') {
    return obj
      .replace(/^[_*]+|[_*]+$/g, '')
      .replace(/^\.|\.$/g, '')
      .trim();
  }
  
  return obj;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Detects if material is about foreign language learning using OpenAI. Uses first ~2000 chars. */
async function detectLanguageLearningMaterial(text: string): Promise<{
  isLanguageLearning: boolean;
  targetLanguage?: string;
  details?: string;
}> {
  try {
    const textSample = text.substring(0, 2000);
    
    const openaiClient = getOpenAI();
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert in analyzing educational materials. Determine whether the given text is about learning a foreign language. Respond ONLY in JSON.',
        },
        {
          role: 'user',
          content: `Analyze the text snippet below and determine:
1) Is this material about learning a foreign language (e.g., grammar lesson, vocabulary lesson, pronunciation, conversation practice)?
2) If yes, which language is being learned?

This IS language-learning material if it:
- Teaches vocabulary, grammar, pronunciation, or conversation in another language
- Includes translations of words/phrases between languages
- Explains language structures (tenses, declensions, sentence patterns, etc.)
- Presents conversational phrases in another language

This is NOT language-learning material if it:
- Is a general documentary/lecture/presentation (even if it mentions languages)
- Is about history/science/technology (even if it contains foreign words)
- Is literature/poetry/art (unless it explicitly teaches language)

Return JSON in this format (JSON only, no markdown):
{
  "isLanguageLearning": true/false,
  "targetLanguage": "language name in English" or null,
  "confidence": "low"/"medium"/"high",
  "details": "short rationale (1-2 sentences)"
}

Text to analyze:
"""
${textSample}
"""`,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      logger.warn('No response from OpenAI while detecting language-learning material');
      return { isLanguageLearning: false };
    }

    const result = JSON.parse(responseText);
    
    logger.info('Detected material type', {
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
    logger.error('Failed to detect material type', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { isLanguageLearning: false }; // graceful degradation on error
  }
}

/** Generates a 10-question quiz from text using OpenAI. Returns null on error. */
export async function generateQuiz(text: string): Promise<Quiz | null> {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error('Source text is empty');
    }

    const MAX_TOKENS = 128000;
    const TOKEN_TO_CHAR_RATIO = 4;
    const RESERVED_TOKENS = 10000;
    const MAX_CHARS = (MAX_TOKENS - RESERVED_TOKENS) * TOKEN_TO_CHAR_RATIO;

    if (text.length > MAX_CHARS) {
      throw new Error(
        `Text is too long (${text.length} characters). Maximum: ${MAX_CHARS} characters.`
      );
    }

    const randomSeed = Math.random().toString(36).substring(2, 10);

    logger.info('Detecting material type (language-learning vs general)...');
    const materialAnalysis = await detectLanguageLearningMaterial(text);
    const isLanguageLearning = materialAnalysis.isLanguageLearning;
    const targetLanguage = materialAnalysis.targetLanguage;

    let languageInstructions = '';
    if (isLanguageLearning && targetLanguage) {
      languageInstructions = `

IMPORTANT: This material is about learning a foreign language (${targetLanguage}).

Questions MUST focus on:
- meanings of words and phrases in the target language
- translations between languages as shown in the material
- vocabulary usage in context
- grammar concepts covered in the material

Do NOT ask about:
- overall vibe/mood
- how/why the material was made
- unrelated history/culture (unless it is directly tied to language usage)

Good question example: "What does the phrase '[a specific phrase from the text]' mean?"
Bad question example: "What is the overall vibe of this material?"
`;
    }

    const prompt = `Create an educational quiz based on the text below.${languageInstructions}

REQUIREMENTS:
1. Generate EXACTLY 10 multiple-choice questions
2. Each question must have 4 answers (A, B, C, D) with exactly one correct answer
3. Add an explanation for each question (2-3 sentences)
4. Questions must test UNDERSTANDING of the material
5. Write the question and answers in the same language as the source text

RANDOM IDENTIFIER: ${randomSeed} - use it to pick diverse topics from the text.

JSON STRUCTURE (EXACTLY):
{
  "questions": [
    {
      "question": "Question text without any decoration?",
      "answers": [
        "First answer",
        "Second answer",
        "Third answer",
        "Fourth answer"
      ],
      "correct_answer": 0,
      "explanation": "Explain why the answer is correct"
    }
  ]
}

CRITICAL RULES:
- Return ONLY valid JSON (no markdown, no code fences)
- JSON keys must be plain (no surrounding underscores/asterisks, no HTML tags)
- Answers must not start with leading dots (e.g. ".Answer")
- Do not add markdown formatting to text values
- Use the key "explanation" (not "explanations", "justification", etc.)

SOURCE TEXT:
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
            'You are an expert at creating educational quizzes. ' +
            'ALWAYS return ONLY valid JSON with no extra text. ' +
            'NEVER use markdown, surrounding underscores, asterisks, or HTML tags in JSON keys. ' +
            'Keys must be: "questions", "question", "answers", "correct_answer", "explanation". ' +
            'Answers must not start with leading dots. ' +
            'Output: strict JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.5,
      frequency_penalty: 0.3,
      presence_penalty: 0.5,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No response from OpenAI');
    }

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

    let quiz: any;
    try {
      quiz = JSON.parse(jsonText);
    } catch (parseError) {
      logger.error('Failed to parse JSON from OpenAI', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        jsonTextSample: jsonText.substring(0, 500),
      });
      throw new Error(
        `JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
    }

    if (quiz && typeof quiz === 'object') {
      quiz = cleanObjectKeys(quiz);
    }

    const normalizedQuiz: any = {};
    for (const key of Object.keys(quiz)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
      if (normalizedKey === 'pytania' || normalizedKey === 'questions') {
        normalizedQuiz.questions = quiz[key];
      } else {
        normalizedQuiz[key] = quiz[key];
      }
    }
    quiz = normalizedQuiz;

    if (!quiz.questions || !Array.isArray(quiz.questions)) {
      logger.error('Invalid quiz structure', {
        quizKeys: Object.keys(quiz),
        questionsType: typeof quiz.questions,
      });
      throw new Error('Invalid quiz structure: missing questions array');
    }

    if (quiz.questions.length === 0) {
      throw new Error('Quiz contains no questions');
    }

    const finalQuiz: Quiz = {
      questions: quiz.questions,
    };

    for (let i = 0; i < finalQuiz.questions.length; i++) {
      let question = finalQuiz.questions[i];
      
      if (!question || typeof question !== 'object') {
        logger.error('Question is null or undefined', { index: i });
        throw new Error(`Question #${i + 1} is null or undefined`);
      }

      const normalizedQuestion: any = {};
      for (const key of Object.keys(question)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z_]/g, '');
        
        if (normalizedKey === 'pytanie' || normalizedKey === 'question') {
          normalizedQuestion.question = (question as any)[key];
        } else if (normalizedKey === 'odpowiedzi' || normalizedKey === 'answers') {
          normalizedQuestion.answers = (question as any)[key];
        } else if (
          normalizedKey === 'poprawnaodpowiedz' ||
          normalizedKey === 'poprawna_odpowiedz' ||
          normalizedKey === 'correctanswer' ||
          normalizedKey === 'correct_answer' ||
          normalizedKey === 'correctanswerindex'
        ) {
          normalizedQuestion.correct_answer = (question as any)[key];
        } else if (normalizedKey === 'uzasadnienie' || normalizedKey === 'uzasadnienia' || normalizedKey === 'explanation' || normalizedKey === 'justification') {
          normalizedQuestion.explanation = (question as any)[key];
        } else {
          normalizedQuestion[key] = (question as any)[key];
        }
      }
      question = normalizedQuestion;
      finalQuiz.questions[i] = question;
      
      const hasQuestion =
        question.question &&
        typeof question.question === 'string' &&
        question.question.trim().length > 0;
      const hasAnswers = question.answers && Array.isArray(question.answers);
      const hasCorrectAnswer = typeof question.correct_answer === 'number';
      
      if (!hasQuestion || !hasAnswers) {
        logger.error('Invalid question structure', {
          index: i,
          questionKeys: Object.keys(question),
          hasQuestion,
          hasAnswers,
          fullQuestion: JSON.stringify(question, null, 2),
        });
        throw new Error(
          `Invalid structure for question #${i + 1}. ` +
          `Missing required fields (question or answers).`
        );
      }
      
      if (!Array.isArray(question.answers) || question.answers.length !== 4) {
        logger.error('Invalid number of answers', {
          index: i,
          expected: 4,
          actual: question.answers?.length || 0,
          answers: question.answers,
        });
        throw new Error(
          `Question #${i + 1} has ${question.answers?.length || 0} answers instead of 4. ` +
          `OpenAI returned an invalid format.`
        );
      }
      
      for (let j = 0; j < question.answers.length; j++) {
        const answer = question.answers[j];
        
        if (typeof answer !== 'string') {
          question.answers[j] = String(answer);
        }
        
        if (!question.answers[j] || question.answers[j].trim().length === 0) {
          logger.error('Empty answer', {
            questionIndex: i,
            answerIndex: j,
          });
          throw new Error(
            `Question #${i + 1}, answer #${j + 1} is empty.`
          );
        }
        
        question.answers[j] = question.answers[j].replace(/^\s*\.+\s*/, '').trim();
      }
      
      if (!hasCorrectAnswer || question.correct_answer < 0 || question.correct_answer > 3) {
        logger.error('Invalid correct answer index', {
          index: i,
          correct_answer: question.correct_answer,
        });
        throw new Error(
          `Question #${i + 1}: invalid correct answer index (${question.correct_answer}). ` +
          `Expected 0-3.`
        );
      }
      
      if (question.explanation !== undefined && typeof question.explanation !== 'string') {
        question.explanation = String(question.explanation);
      }
    }

    return finalQuiz;
  } catch (error) {
    logger.error('Quiz generation failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
}

/** Validates and cleans manually pasted text (fallback when auto-fetch fails). Returns null if invalid. */
export async function processManualText(text: string): Promise<string | null> {
  if (!text || typeof text !== 'string') {
    return null;
  }

  let cleaned = text.trim();

  const MIN_LENGTH = 100;
  if (cleaned.length < MIN_LENGTH) {
    logger.warn(`Text is too short: ${cleaned.length} characters (minimum: ${MIN_LENGTH})`);
    return null;
  }

  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  const MAX_LENGTH = 500000;
  if (cleaned.length > MAX_LENGTH) {
    logger.warn(`Text is too long: ${cleaned.length} characters (maximum: ${MAX_LENGTH})`);
    cleaned = cleaned.substring(0, MAX_LENGTH);
  }

  return cleaned;
}

/** Tries YouTube transcript first, then Groq ASR; returns requiresManual if both fail. */
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
  logger.info('Attempting to fetch transcript from YouTube', { url, startSeconds, endSeconds });
  const youtubeTranscript = await getYouTubeTranscript(url, startSeconds, endSeconds);

  if (youtubeTranscript) {
    logger.info('Transcript fetched from YouTube', { url, length: youtubeTranscript.length });
    return {
      success: true,
      transcript: youtubeTranscript,
      requiresManual: false,
      method: 'youtube',
    };
  }

  logger.info('YouTube transcript unavailable, trying Groq ASR', { url, startSeconds, endSeconds });
  
  try {
    const groqTranscript = await getYouTubeTranscriptWithGroq(url, startSeconds, endSeconds);
    
    if (groqTranscript) {
      logger.info('Transcript fetched via Groq', { url, length: groqTranscript.length });
      return {
        success: true,
        transcript: groqTranscript,
        requiresManual: false,
        method: 'groq',
      };
    }
  } catch (groqError) {
    logger.warn('Groq transcription failed', {
      error: groqError instanceof Error ? groqError.message : String(groqError),
      url,
    });
  }

  logger.warn('All automatic methods failed; manual transcript paste required', { url });
  return {
    success: false,
    transcript: null,
    requiresManual: true,
    error:
      '⚠️ YouTube blocked automatic transcript fetching for this video.\n\n' +
      '📝 Please paste the transcript manually below.\n\n' +
      '💡 How to get the transcript:\n' +
      '1. Open the video on YouTube\n' +
      '2. Click "..." under the video → "Show transcript"\n' +
      '3. Copy all text and paste it below\n\n' +
      'The paste field will appear shortly...',
  };
}

