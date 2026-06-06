// Heavy lifting: OpenAI quiz generation, YouTube transcripts and PDF text extraction.
'use server';

import { Innertube } from 'youtubei.js';
import OpenAI from 'openai';
import { extractVideoId, errorMessage } from './utils';
import { logger } from './logger';
import { getYouTubeTranscriptWithGroq } from './groq-transcription';

let openai: OpenAI | null = null;

// Create the OpenAI client once and reuse it. Throws if the API key is missing.
function getOpenAI(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set in environment variables. Check your .env.local file.'
      );
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

// Fetch a YouTube transcript and keep only the segments within the time range.
// Returns the joined text, or null on any failure (UI then offers manual paste).
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
    const info = await youtube.getInfo(videoId);
    const transcriptData = await info.getTranscript();

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
      if (segmentEnd < startMs) return false;
      if (endMs !== undefined && seg.start >= endMs) return false;
      return true;
    });

    if (filteredSegments.length === 0) {
      const rangeDesc =
        endSeconds !== undefined
          ? `in range ${startSeconds}s - ${endSeconds}s`
          : `after ${startSeconds}s`;
      throw new Error(`No transcript segments ${rangeDesc}`);
    }

    return filteredSegments.map((seg: any) => seg.text).join(' ');
  } catch (error) {
    // Failing here is normal for some videos (YouTube blocks captions); the
    // caller then falls back to Groq ASR or manual paste.
    logger.warn('Could not fetch YouTube transcript', { url, error: errorMessage(error) });
    return null;
  }
}

// Extract selectable text from a PDF file. Returns null on error (no OCR).
export async function parsePDF(file: File): Promise<string | null> {
  let parser: any = null;
  try {
    // Lazy require: pdf-parse is CommonJS and server-only (see serverExternalPackages).
    const { PDFParse } = require('pdf-parse');
    const arrayBuffer = await file.arrayBuffer();
    parser = new PDFParse({ data: new Uint8Array(arrayBuffer) });

    const result = await parser.getText();
    const text = result?.text?.trim();

    if (!text) {
      throw new Error(
        'This PDF does not contain extractable text. ' +
        'It is likely a scan (images) or uses a non-standard text layer. ' +
        'OCR is not supported. You can paste text manually in the YouTube form.'
      );
    }

    return text;
  } catch (error) {
    logger.error('PDF parsing failed', {
      error: errorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  } finally {
    await parser?.destroy();
  }
}

// One quiz question. Keys are English; generateQuiz also accepts and normalizes
// legacy Polish keys coming from older data or model output.
export interface QuizQuestion {
  question: string;
  answers: string[];
  correct_answer: number; // Index of the correct answer (0-3)
  explanation?: string; // Optional explanation (2-3 sentences)
}

// A generated quiz: just a list of questions.
export interface Quiz {
  questions: QuizQuestion[];
}

// Recursively strip HTML tags, underscores and markdown from keys and string
// values. Run on the parsed JSON before reading the quiz.
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

// Ask OpenAI whether the material teaches a foreign language, so the quiz prompt
// can be tailored. Looks at roughly the first 2000 characters.
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
    logger.error('Failed to detect material type', { error: errorMessage(error) });
    return { isLanguageLearning: false }; // on error, assume it's not language-learning
  }
}

// Generate a 10-question quiz from the text with OpenAI. Returns null on error.
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
        error: errorMessage(parseError),
        jsonTextSample: jsonText.substring(0, 500),
      });
      throw new Error(`JSON parse error: ${errorMessage(parseError)}`);
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
      error: errorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
}

// Validate and clean text the admin pasted by hand (used when auto-fetch fails).
// Returns null if it's too short or not a string.
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

// Try the YouTube transcript first, then Groq ASR; ask for manual paste if both fail.
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
    logger.warn('Groq transcription failed', { error: errorMessage(groqError), url });
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

