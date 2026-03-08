# BrainGain — Project Documentation

## Overview

**BrainGain** is an AI-assisted learning platform that motivates students with a reward system. Students consume learning materials (YouTube videos or PDFs), take AI-generated quizzes, and earn **reward minutes** after passing.

## Key features

- **Admin panel**
  - Add **YouTube** materials
    - Optional clip range (start/end)
    - Automatic transcript fetching
    - Fallback to **Groq ASR** (Whisper) when YouTube captions are unavailable
    - Final fallback: manual transcript paste
  - Add **PDF** materials
    - Upload to Supabase Storage (`documents` bucket)
    - Extract selectable text (no OCR)
  - Set **reward minutes** manually (optional)
  - View / clear application logs
  - Delete materials

- **Student dashboard**
  - Browse available materials
  - Open a material and take a quiz
  - Earn reward minutes after passing

- **Quiz**
  - Generated with OpenAI (`gpt-4o-mini`)
  - Canonical schema uses English JSON keys:
    - `questions[]`
    - `question`
    - `answers[]`
    - `correct_answer`
    - `explanation`
  - Parser still accepts legacy Polish keys and normalizes them for backwards compatibility
  - Passing requires **90%** correct answers
  - Cooldown after a failed attempt: **10 minutes**

## Tech stack

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage (`documents` bucket)
- **Styling**: Tailwind CSS
- **AI**:
  - OpenAI `gpt-4o-mini` for quizzes
  - Groq `whisper-large-v3` (ASR fallback)
- **Libraries**:
  - `youtubei.js` — YouTube transcript fetching (captions)
  - `yt-dlp-wrap` — downloading audio for ASR
  - `pdf-parse` — extracting text from PDFs

## Repository structure (high-level)

- `src/app/`
  - `admin/` — admin UI
  - `student/` — student UI
  - `api/logs/` — logs endpoint (requires `ADMIN_SECRET`)
- `src/lib/`
  - `materials.ts` — CRUD for materials (+ PDF upload & transcript logic)
  - `services.ts` — OpenAI quiz generation, transcript fetching, PDF parsing
  - `quiz.ts` — cooldown, attempt tracking, reward creation, quiz verification
  - `rewards.ts` — aggregates reward minutes
  - `groq-transcription.ts` — yt-dlp download + Groq ASR transcription
  - `logger.ts` — file-based logging + logs API helpers
- `supabase/`
  - `migration.sql` — database schema
  - `SETUP.md` — Supabase setup guide
  - `add_reward_minutes.sql` — migration helper for existing DBs

## Setup & running

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment variables

Create `.env.local` in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# OpenAI
OPENAI_API_KEY=your_openai_key_here

# Admin auth (admin panel + logs)
ADMIN_SECRET=a_very_long_random_secret_string

# Groq (optional, ASR fallback)
GROQ_API_KEY=your_groq_api_key_here
```

### 3) Set up Supabase

- Run `supabase/migration.sql` in Supabase SQL Editor
- Create a public Storage bucket named `documents`
- Add Storage policies as described in `supabase/SETUP.md`

### 4) Start dev server

```bash
npm run dev
```

Open `http://localhost:3000`.

## Data model (Supabase)

### Tables

- `materials`
  - `type`: `youtube` | `pdf`
  - `content_text`: transcript / extracted PDF text
  - `video_url`: YouTube URL or public PDF URL
  - `start_offset`, `end_offset`: clip range (YouTube)
  - `reward_minutes`: optional manual reward minutes
- `attempts`
  - stores quiz attempts (`score`, `passed`, timestamps)
- `rewards`
  - stores reward minutes per material
- `quizzes` (optional)
  - reserved for caching generated quizzes (currently not required)

## How the core flows work

### Adding a YouTube material

1. Admin submits a YouTube URL (optionally with a clip range).
2. The server attempts transcript fetching:
   - YouTube captions via `youtubei.js`
   - if unavailable: audio download via `yt-dlp` + Groq ASR
   - if that fails: the UI requests manual transcript paste
3. Material is stored in `materials` with transcript text.

### Adding a PDF material

1. Admin uploads a PDF.
2. PDF is uploaded to Storage (`documents` bucket).
3. Text is extracted using `pdf-parse`.
4. Material is stored in `materials` (public PDF URL saved in `video_url`).

### Taking a quiz + rewards

1. Student starts a quiz.
2. The server checks cooldown (based on last failed attempt).
3. Quiz is generated with OpenAI from `content_text`.
4. Student submits answers.
5. Attempt is stored in `attempts`.
6. If passed:
   - reward minutes are inserted into `rewards` (either `reward_minutes` from the material, or computed from estimated duration)

## Known limitations

- **No OCR for scanned PDFs**: the PDF must contain selectable text.
- **YouTube transcripts are not always available**: some videos block captions access; manual paste fallback exists.
- **Language forcing in Groq ASR**: currently configured for Polish (`language: 'pl'`). Adjust if your content is multilingual.

## Troubleshooting

- **Supabase connection errors**
  - verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - verify Storage bucket + policies
- **Admin panel login fails**
  - ensure `ADMIN_SECRET` is set and you’re using the same secret in the UI (stored in `localStorage`)

