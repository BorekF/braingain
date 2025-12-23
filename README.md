# 🎓 BrainGain

> AI-Powered Educational Platform with Smart Quiz Generation and Reward System

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green?style=flat-square&logo=supabase)](https://supabase.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o--mini-orange?style=flat-square&logo=openai)](https://openai.com/)

BrainGain is an advanced educational platform that motivates students to learn by combining AI-generated quizzes with a reward system. Administrators can easily add educational materials (YouTube videos, PDF documents), while students earn minutes of screen time by successfully completing automatically generated quizzes.

![Dashboard Preview](./public/screenshots/dashboard.png)
![Quiz Preview](./public/screenshots/quiz.png)

---

## ✨ Key Features

### 🎯 For Students
- **Interactive Dashboard** - Visual cards showing materials with status badges (Completed/Available/Locked)
- **Reward Counter** - Real-time tracking of earned minutes
- **Smart Quiz System** - Single-question interface with 30-second timer per question
- **Success Animations** - Confetti celebration on passing quizzes (≥90% score)
- **Cooldown System** - 10-minute lockout after failed attempts with countdown timer

### 👨‍💼 For Administrators
- **Secure Login** - Password-protected admin panel at `/admin`
- **YouTube Integration** - Add videos with custom time ranges (start/end)
- **Triple-Level Transcription**:
  1. Automatic subtitle extraction from YouTube
  2. Audio transcription via Groq API (Whisper-large-v3) for videos without subtitles
  3. Manual text input fallback
- **PDF Upload** - Automatic text extraction from PDF documents
- **Custom Rewards** - Set reward minutes per material or use auto-calculation
- **Log Monitoring** - Real-time log viewer with auto-refresh

### 🤖 AI-Powered Intelligence
- **Language Learning Detection** - AI analyzes content and adapts quiz questions:
  - For language materials: vocabulary, translations, grammar questions
  - For general content: facts, analysis, details
- **Consistent JSON Parsing** - Aggressive normalization handles API inconsistencies
- **Dynamic Difficulty** - Always 90% passing threshold (allows 1 mistake for ≤10 questions)
- **Question Variety** - Randomized seeds ensure different quizzes each time

---

## 🛠️ Tech Stack

| Category | Technologies |
|----------|-------------|
| **Framework** | Next.js 16 (App Router), React 19, TypeScript 5 |
| **Database** | Supabase (PostgreSQL + Storage) |
| **AI/ML** | OpenAI GPT-4o-mini, Groq Whisper-large-v3 |
| **Styling** | Tailwind CSS 4 |
| **Integrations** | YouTubei.js, pdf-parse, yt-dlp-wrap |
| **Icons** | Lucide React |
| **Deployment** | Railway (Docker) |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm/yarn
- Supabase account (free tier works)
- OpenAI API key
- Groq API key (optional but recommended)
- yt-dlp installed globally (for video transcription)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/braingain.git
   cd braingain
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install yt-dlp** (for audio transcription)
   ```bash
   # macOS/Linux
   brew install yt-dlp
   
   # Windows (via chocolatey)
   choco install yt-dlp
   
   # Or download from: https://github.com/yt-dlp/yt-dlp
   ```

4. **Set up Supabase**
   - Create a new project at [supabase.com](https://supabase.com)
   - Run the migration script from `supabase/migration.sql`
   - Create a storage bucket named `documents` (for PDFs)
   - See detailed instructions in `supabase/SETUP.md`

5. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and fill in your values:
   - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
   - `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `GROQ_API_KEY` - Your Groq API key (optional)
   - `ADMIN_SECRET` - Strong password for admin panel

6. **Run the development server**
   ```bash
   npm run dev
   ```
   
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📖 Usage

### Student Access
1. Navigate to [http://localhost:3000](http://localhost:3000) (auto-redirects to `/student`)
2. Browse available materials
3. Click on a material to start learning
4. Watch/read the content
5. Click "Rozpocznij Quiz" to generate a quiz
6. Answer questions (30 seconds per question)
7. Pass with ≥90% to earn reward minutes

### Admin Access
1. Navigate to [http://localhost:3000/admin](http://localhost:3000/admin)
2. Enter your `ADMIN_SECRET` password
3. Use tabs to add YouTube videos or PDF documents
4. Set custom time ranges for videos (start/end minutes)
5. Optionally set custom reward minutes
6. Monitor logs in the "Pokaż Logi" panel

---

## 📁 Project Structure

```
braingain/
├── src/
│   ├── app/
│   │   ├── admin/              # Admin panel with login
│   │   │   ├── page.tsx        # Login screen
│   │   │   └── AdminPanel.tsx  # Main admin interface
│   │   ├── student/            # Student interface
│   │   │   ├── page.tsx        # Dashboard with materials
│   │   │   └── material/[id]/  # Individual material page
│   │   ├── api/
│   │   │   └── logs/           # API endpoint for log access
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Home (redirects to /student)
│   └── lib/                    # Backend logic (Server Actions)
│       ├── services.ts         # YouTube, PDF, AI services
│       ├── materials.ts        # Material CRUD operations
│       ├── quiz.ts             # Quiz generation & validation
│       ├── rewards.ts          # Reward calculations
│       ├── groq-transcription.ts # Audio transcription via Groq
│       ├── utils.ts            # Helper functions
│       ├── logger.ts           # Logging system
│       └── supabase.ts         # Supabase client
├── supabase/
│   ├── migration.sql           # Database schema
│   └── SETUP.md                # Setup instructions
├── logs/
│   └── app.log                 # Application logs (auto-trimmed)
├── Dockerfile                  # Docker configuration for Railway
├── DOCUMENTATION.md            # Complete technical documentation
└── README.md                   # This file
```

---

## 🗄️ Database Schema

### Tables

**materials** - Educational content
```sql
- id (uuid, primary key)
- title (text)
- type (text: 'youtube' | 'pdf')
- content_text (text)
- video_url (text, nullable)
- start_offset (int, seconds)
- end_offset (int, seconds, nullable)
- reward_minutes (int, nullable)
- created_at (timestamp)
```

**attempts** - Quiz attempt history
```sql
- id (uuid, primary key)
- material_id (uuid, foreign key)
- score (int)
- passed (boolean)
- created_at (timestamp)
```

**rewards** - Earned rewards
```sql
- id (uuid, primary key)
- material_id (uuid, foreign key)
- minutes (int)
- claimed (boolean)
- created_at (timestamp)
```

---

## 🚢 Deployment

### Railway (Recommended)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Create Railway Project**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository

3. **Set Environment Variables**
   Add all variables from `.env.example` in Railway dashboard

4. **Deploy**
   Railway will automatically detect the `Dockerfile` and deploy

See detailed deployment instructions in `DOCUMENTATION.md`.

---

## 🎨 Screenshots

### Student Dashboard
Clean, modern interface showing available materials with status indicators and reward counter.

### Quiz Interface
Single-question view with 30-second timer and progress indicator.

### Admin Panel
Intuitive tabs for adding YouTube videos and PDF documents, with live log monitoring.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

---

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - The React Framework
- [Supabase](https://supabase.com/) - Open Source Firebase Alternative
- [OpenAI](https://openai.com/) - GPT-4o-mini for quiz generation
- [Groq](https://groq.com/) - Ultra-fast AI inference for audio transcription
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Lucide](https://lucide.dev/) - Beautiful icon library

---

## 📧 Contact

Your Name - [@yourtwitter](https://twitter.com/yourtwitter) - your.email@example.com

Project Link: [https://github.com/yourusername/braingain](https://github.com/yourusername/braingain)

---

<div align="center">
  <strong>Built with ❤️ using Next.js and AI</strong>
  <br />
  <sub>Star ⭐ this repository if you find it helpful!</sub>
</div>
