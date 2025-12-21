# BrainGain - Kompletna Dokumentacja Projektu

## 📋 Spis Treści

1. [Przegląd Projektu](#przegląd-projektu)
2. [Co Zostało Zaimplementowane](#co-zostało-zaimplementowane)
3. [Architektura Systemu](#architektura-systemu)
4. [Struktura Plików](#struktura-plików)
5. [Konfiguracja i Uruchomienie](#konfiguracja-i-uruchomienie)
6. [Jak to Działa](#jak-to-działa)
7. [API i Funkcje](#api-i-funkcje)
8. [Jak Kontynuować Pracę](#jak-kontynuować-pracę)
9. [Znane Problemy i Rozwiązania](#znane-problemy-i-rozwiązania)

---

## 📖 Przegląd Projektu

**BrainGain** to platforma edukacyjna wspierana przez AI, która motywuje uczniów do nauki poprzez system nagród. Uczniowie oglądają materiały edukacyjne (filmy YouTube lub dokumenty PDF), rozwiązują quizy generowane przez AI, a za sukces otrzymują nagrody w postaci czasu na gry wideo.

### Główne Funkcjonalności

- ✅ **Panel Administratora**: Dodawanie materiałów (YouTube/PDF) z automatycznym pobieraniem transkryptów
- ✅ **Trójpoziomowe Pobieranie Transkryptów**: 
  1. Automatyczne pobieranie napisów z YouTube (najszybsze, darmowe)
  2. **Transkrypcja przez Groq API (ASR)** - dla filmów bez napisów (Whisper-large-v3)
  3. Opcja ręcznego wklejenia (fallback)
- ✅ **Parsowanie PDF**: Automatyczna ekstrakcja tekstu z dokumentów PDF
- ✅ **Generowanie Quizów**: Dynamiczne tworzenie quizów przez OpenAI GPT-4o-mini
- ✅ **Zarządzanie Materiałami**: Lista, podgląd i usuwanie materiałów edukacyjnych

### Technologie

- **Framework**: Next.js 16.0.10 (App Router)
- **Język**: TypeScript
- **Baza Danych**: Supabase (PostgreSQL)
- **Stylizacja**: Tailwind CSS
- **AI**: OpenAI GPT-4o-mini (quizy), Groq Whisper-large-v3 (transkrypcja audio)
- **Biblioteki**:
  - `youtubei.js` - pobieranie transkryptów z YouTube
  - `groq-sdk` - transkrypcja audio przez Groq API
  - `yt-dlp-wrap` - pobieranie audio z YouTube
  - `pdf-parse` - parsowanie PDF
  - `lucide-react` - ikony

---

## ✅ Co Zostało Zaimplementowane

### 1. Backend - Materiały (`src/lib/materials.ts`)

Server Actions do zarządzania materiałami w bazie danych:

- ✅ `getMaterials()` - Pobiera wszystkie materiały
- ✅ `addYouTubeMaterial(url, startMinutes, manualText?, rewardMinutes?)` - Dodaje materiał YouTube z opcjonalną nagrodą
- ✅ `addPDFMaterial(file, title?, rewardMinutes?)` - Dodaje materiał PDF z opcjonalną nagrodą
- ✅ `deleteMaterial(id)` - Usuwa materiał

**Nowa funkcjonalność:**
- ✅ Admin może ustawić nagrodę w minutach przy dodawaniu materiału
- ✅ Jeśli nagroda nie jest ustawiona, system używa automatycznego obliczenia na podstawie czasu trwania

### 2. Backend - Serwisy (`src/lib/services.ts`)

#### Funkcje YouTube
- ✅ `getYouTubeTranscript(url, startSeconds)` - Pobiera transkrypt z YouTube (napisów)
- ✅ `getYouTubeTranscriptHybrid(url, startSeconds)` - **Trójpoziomowe podejście:**
  1. Próbuje pobrać napisy z YouTube (najszybsze)
  2. Jeśli nie ma napisów → pobiera audio i transkrybuje przez Groq API (ASR)
  3. Jeśli to też nie działa → zwraca informację o potrzebie ręcznego wklejenia
- ✅ `processManualText(text)` - Walidacja i czyszczenie ręcznie wklejonego tekstu

#### Funkcje Groq ASR (`src/lib/groq-transcription.ts`)
- ✅ `downloadYouTubeAudio(url, startSeconds)` - Pobiera ścieżkę audio z YouTube używając yt-dlp
- ✅ `transcribeWithGroq(audioFilePath, startSeconds)` - Transkrybuje plik audio przez Groq API (Whisper-large-v3)
- ✅ `getYouTubeTranscriptWithGroq(url, startSeconds)` - Kompletna funkcja: pobiera audio i transkrybuje

#### Funkcje pomocnicze (`src/lib/utils.ts`)
- ✅ `extractVideoId(url)` - Wyodrębnia videoId z URL YouTube (funkcja synchroniczna)

#### Funkcje PDF
- ✅ `parsePDF(file)` - Parsuje plik PDF i wyciąga tekst
- ✅ Zapisywanie pliku PDF do Supabase Storage (bucket 'documents')
- ✅ Wyświetlanie PDF w interfejsie użytkownika (iframe + przycisk pobierania)

#### Funkcje AI
- ✅ `generateQuiz(text)` - Generuje quiz z 10 pytaniami używając OpenAI
- ✅ **Inteligentne wykrywanie materiałów językowych przez OpenAI** - System używa dodatkowego wywołania API do analizy typu materiału:
  - Analiza fragmentu tekstu (~2000 znaków) przez GPT-4o-mini
  - Określa czy materiał dotyczy nauki języka obcego (confidence: low/medium/high)
  - Wykrywa język docelowy (angielski, hiszpański, niemiecki, itp.)
  - Dla materiałów językowych: pytania o znaczenie słów, tłumaczenia, zwroty, gramatykę
  - Dla materiałów ogólnych: pytania o fakty, analizy, szczegóły
  - Blokuje nieprzydatne pytania typu "Jaki jest klimat filmu" dla lekcji językowych
- ✅ **4 strategie zwiększające różnorodność quizów:**
  1. **Wstrzyknięcie losowości do promptu** - Każde wywołanie używa unikalnego identyfikatora (seed), który zmienia "ścieżkę myślową" AI
  2. **Parametry frequency_penalty i presence_penalty** - Wymuszają sięganie głębiej w tekst i unikanie powtarzania tematów
  3. **Losowanie "Osobowości Egzaminatora"** - 5 różnych stylów pytań (Faktograf, Analityk, Detektyw, Konceptualista, Praktyk)
  4. **Technika "Nadmiarowości i Losowania"** - Generowanie 18 pytań, potem losowe wybranie 10 z nich
- ✅ Walidacja rozmiaru tekstu przed wysłaniem do OpenAI (limit ~472k znaków)
- ✅ Walidacja `OPENAI_API_KEY` przy inicjalizacji klienta

**Wszystkie funkcje są Server Actions** (`'use server'`) i mogą być wywoływane bezpośrednio z komponentów React.


### 3. Baza Danych (Supabase)

#### Tabele
- ✅ `materials` - Przechowuje lekcje (YouTube/PDF)
  - `reward_minutes` - Liczba minut nagrody za zaliczenie materiału (opcjonalne, ustawiane przez admina)
- ✅ `attempts` - Historia prób rozwiązania quizów
- ✅ `rewards` - Nagrody za zaliczone materiały
- ✅ `quizzes` - Opcjonalna tabela do cache'owania quizów

#### Migracja
- ✅ Pełny skrypt SQL w `supabase/migration.sql`
- ✅ Instrukcje setupu w `supabase/SETUP.md`

### 4. Interfejs Administratora

- ✅ Strona `/admin` z ekranem logowania hasłem
- ✅ **Ekran logowania** - Zasłaniający ekran z polem hasła (bez pola użytkownika)
- ✅ **AdminPanel.tsx** - Kompletny UI z zakładkami YouTube/PDF
- ✅ Logika backendowa gotowa (materials.ts)
- ✅ Formularze dodawania materiałów (YouTube z opcją ręcznego wklejenia, PDF)
- ✅ **Pole nagrody w minutach** - Admin może ustawić nagrodę przy dodawaniu materiału
- ✅ **Wartość sugerowana** - System automatycznie sugeruje nagrodę na podstawie czasu trwania materiału
- ✅ Lista materiałów z możliwością usunięcia
- ✅ **Weryfikacja hasła** - Hasło jest weryfikowane przez porównanie z `ADMIN_SECRET` z `.env.local`
- ✅ **Sesja logowania** - Hasło jest przechowywane w localStorage do czasu wylogowania

### 5. Konfiguracja

- ✅ `.cursorrules` - Instrukcje dla AI asystentów
- ✅ `next.config.ts` - Konfiguracja ładowania zmiennych z katalogu nadrzędnego
- ✅ TypeScript z ścisłym typowaniem

### 6. System Logowania

- ✅ `src/lib/logger.ts` - Logger zapisujący do pliku `logs/app.log`
- ✅ Automatyczne przechwytywanie wszystkich wywołań `console.*` (log, error, warn, info, debug)
- ✅ Automatyczne czyszczenie starych logów (zachowuje ostatnie 1000 linii)
- ✅ Filtrowanie nieistotnych komunikatów (source map warnings, itp.)
- ✅ Grupowanie duplikatów (wykrywa powtarzające się komunikaty w ciągu 5 sekund)
- ✅ Lepsze formatowanie stack trace (dzieli na czytelne linie)
- ✅ Endpoint API `/api/logs` - Odczyt ostatnich logów (z autoryzacją przez ADMIN_SECRET)
- ✅ Panel logów w AdminPanel - Wyświetlanie logów w czasie rzeczywistym z automatycznym odświeżaniem
- ✅ Wszystkie `console.error/warn` zastąpione loggerem z zapisem do pliku

### 7. Interfejs Ucznia

#### Dashboard (`src/app/student/page.tsx`)
- ✅ Wyświetlanie kafelków z materiałami z bazy danych
- ✅ Duży licznik "Zgromadzone minuty na telefon" (suma z tabeli rewards)
- ✅ Status materiałów: "Do zrobienia", "Zaliczone", "Zablokowane" (cooldown)
- ✅ **Wyświetlanie nagrody** - Każdy materiał pokazuje ile minut nagrody można zdobyć
- ✅ **Wyświetlanie czasu trwania** - Każdy materiał pokazuje szacowany czas trwania
- ✅ Responsywny design z Tailwind CSS

#### Strona Materiału (`src/app/student/material/[id]/page.tsx`)
- ✅ **Sekcja Nauki**: 
  - YouTube: iframe z wideo (start od `start_offset`)
  - PDF: iframe z wyświetlaniem PDF + przycisk pobierania
- ✅ **Wyświetlanie informacji o materiale**:
  - Czas trwania materiału (~X min)
  - Nagroda za zaliczenie (+X min nagrody)
- ✅ **Sekcja Quizu**:
  - Przycisk "Rozpocznij Quiz" z generowaniem przez OpenAI
  - **Interfejs quizu z jedną pytaniem na raz**:
    - Wyświetlanie tylko jednego pytania na ekranie
    - Timer 30 sekund na każde pytanie
    - Automatyczne przejście do następnego pytania po upływie czasu (pytanie oznaczone jako niezaliczone)
    - Przycisk "Następne pytanie" do ręcznego przejścia
    - Przycisk "Pomiń" do pominięcia pytania bez odpowiedzi
  - Weryfikacja odpowiedzi po zakończeniu wszystkich pytań
  - Wyświetlanie poprawnych/niepoprawnych odpowiedzi z uzasadnieniami (po zakończeniu quizu)
- ✅ **Logika Cooldownu**:
  - Sprawdzanie ostatniej nieudanej próby w bazie danych
  - Blokada na 10 minut po nieudanej próbie
  - Licznik odliczający czas (MM:SS)
  - Automatyczne odświeżanie statusu
- ✅ **System Timera Pytań**:
  - Każde pytanie ma limit czasu 30 sekund
  - Wizualny wskaźnik czasu pozostałego na pytanie
  - Automatyczne przejście do następnego pytania po upływie czasu
  - Pytania bez odpowiedzi są traktowane jako niepoprawne
- ✅ **System Nagród**:
  - Automatyczne dodawanie 30 minut nagrody po zaliczeniu (>= 9/10)
  - Animacja confetti przy sukcesie
  - Komunikat o zdobytej nagrodzie

### 8. Backend - Quizy i Nagrody

#### `src/lib/quiz.ts` (Server Actions)
- ✅ `checkCooldown(materialId)` - Sprawdza czy można rozwiązać quiz (10 min cooldown)
- ✅ `checkMaterialPassed(materialId)` - Sprawdza czy materiał został zaliczony
- ✅ `startQuiz(materialId)` - Generuje quiz (sprawdza cooldown, wywołuje OpenAI)
- ✅ `submitQuiz(materialId, answers)` - Weryfikuje odpowiedzi, zapisuje wynik, dodaje nagrodę
- ✅ `calculateRewardMinutes(durationMinutes)` - Oblicza sugerowaną nagrodę na podstawie czasu trwania (eksportowana)
- ✅ **Używa `reward_minutes` z bazy danych** - Jeśli admin ustawił nagrodę, używa jej; w przeciwnym razie oblicza automatycznie

#### `src/lib/rewards.ts` (Server Actions)
- ✅ `getTotalRewards()` - Pobiera sumę wszystkich nagród (zgromadzone minuty)

**Konfiguracja:**
- Cooldown: 10 minut po nieudanej próbie
- Próg zaliczenia: 9/10 poprawnych odpowiedzi
- Nagroda: 30 minut za zaliczenie materiału

---

## 🏗️ Architektura Systemu

### Przepływ Danych

```
┌─────────────────┐
│  Administrator  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  /admin/page.tsx                │
│  (Ekran logowania hasłem)       │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  AdminPanel.tsx                 │
│  (UI - Formularze)              │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  materials.ts (Server Actions)  │
│  - addYouTubeMaterial()         │
│  - addPDFMaterial()             │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  services.ts (Server Actions)   │
│  - getYouTubeTranscript()       │
│  - parsePDF()                   │
│  - generateQuiz()               │
└────────┬────────────────────────┘
         │
         ├─────────────────┬─────────────────┐
         ▼                 ▼                 ▼
    ┌─────────┐      ┌─────────┐      ┌─────────┐
    │ YouTube │      │   PDF   │      │ OpenAI  │
    │   API   │      │  Parser │      │   API   │
    └─────────┘      └─────────┘      └─────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Supabase (PostgreSQL)          │
│  - materials                    │
│  - attempts                     │
│  - rewards                      │
└─────────────────────────────────┘
```

### Hybrydowe Pobieranie Transkryptów

```
1. Próba automatyczna (youtubei.js)
   │
   ├─✅ Sukces → Zwróć transkrypt
   │
   └─❌ Błąd → Pokaż opcję ręcznego wklejenia
                │
                └─ Administrator wkleja tekst
                   │
                   └─ Walidacja i zapis
```

---

## 📁 Struktura Plików

```
braingain/
├── src/
│   ├── app/
│   │   ├── admin/
│   │   │   ├── page.tsx              # Strona admin z ekranem logowania
│   │   │   └── AdminPanel.tsx        # Panel administratora
│   │   ├── student/
│   │   │   ├── page.tsx              # Dashboard ucznia
│   │   │   └── material/
│   │   │       └── [id]/
│   │   │           └── page.tsx      # Strona materiału
│   │   ├── layout.tsx                # Główny layout
│   │   └── page.tsx                  # Strona główna (przekierowuje na /student)
│   └── lib/
│       ├── services.ts               # Serwisy: YouTube, PDF, AI (Server Actions)
│       ├── materials.ts              # Server Actions: CRUD materiałów
│       ├── utils.ts                  # Funkcje pomocnicze (synchroniczne)
│       ├── logger.ts                 # System logowania (przechwytywanie console.*)
│       └── supabase.ts               # Klient Supabase
├── logs/
│   └── app.log                       # Plik z logami (automatycznie czyszczony)
├── supabase/
│   ├── migration.sql                 # Skrypt migracyjny SQL
│   └── SETUP.md                      # Instrukcje setupu Supabase
├── .cursorrules                      # Instrukcje dla AI
├── next.config.ts                    # Konfiguracja Next.js
├── package.json                      # Zależności
└── DOCUMENTATION.md                  # Ten plik
```

---

## ⚙️ Konfiguracja i Uruchomienie

### Wymagania Lokalne

- Node.js 18+
- Konto Supabase (darmowe)
- Konto OpenAI z API key (do generowania quizów)
- **Konto Groq z API key** (do transkrypcji audio - opcjonalne, ale zalecane)
- **yt-dlp** zainstalowany w systemie (do pobierania audio z YouTube)
- npm lub yarn

### Uruchomienie Lokalne

```bash
npm run dev
```

Aplikacja będzie dostępna na `http://localhost:3000`

### Dostęp do Panelu Administratora

Wejdź na: `http://localhost:3000/admin`

Wprowadź hasło (wartość z `ADMIN_SECRET` w `.env.local`).

**Uwaga**: Strona główna (`http://localhost:3000`) automatycznie przekierowuje na `/student`.

---

## 🚂 Wdrożenie na Railway

### Wymagania do Wdrożenia

- Konto na [Railway.app](https://railway.app/) (darmowy trial: $5 kredytów)
- Repozytorium GitHub z projektem
- Wszystkie zmienne środowiskowe skonfigurowane (patrz sekcja "Zmienne Środowiskowe")

### Krok po Kroku - Wdrożenie na Railway

#### 1. Przygotowanie Projektu (Wykonane ✅)

Projekt jest już przygotowany do wdrożenia:
- ✅ `Dockerfile` - zawiera wszystkie zależności (Node.js, Python, ffmpeg, yt-dlp)
- ✅ `.dockerignore` - wyklucza niepotrzebne pliki z buildu
- ✅ `next.config.ts` - skonfigurowany dla środowiska produkcyjnego

#### 2. Push do GitHub

```bash
git add Dockerfile .dockerignore
git commit -m "Add Docker configuration for Railway deployment"
git push origin main
```

#### 3. Utworzenie Projektu na Railway

1. Wejdź na [railway.app](https://railway.app/) i zaloguj się (najlepiej przez GitHub)
2. Kliknij **+ New Project** → **Deploy from GitHub repo**
3. Wybierz swoje repozytorium z listy
4. Railway automatycznie wykryje `Dockerfile` i zacznie budować projekt

#### 4. Konfiguracja Zmiennych Środowiskowych

W panelu Railway przejdź do zakładki **Variables** i dodaj wszystkie wymagane zmienne:

| Nazwa Zmiennej | Opis | Przykładowa Wartość |
|:---|:---|:---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Twojego projektu Supabase | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Klucz publiczny Supabase | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Klucz prywatny Supabase (dla backendu) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `OPENAI_API_KEY` | Klucz API OpenAI | `sk-proj-...` |
| `GROQ_API_KEY` | Klucz API Groq | `gsk_...` |
| `ADMIN_SECRET` | Hasło do panelu administratora | `TwojeBardzoTajneHaslo123` |
| `NODE_ENV` | Środowisko (musi być `production`) | `production` |

**Uwaga**: Railway automatycznie ustawia zmienną `PORT` - nie musisz jej dodawać ręcznie.

#### 5. Generowanie Domeny

1. Przejdź do zakładki **Settings** w Railway
2. W sekcji **Networking** kliknij **Generate Domain**
3. Otrzymasz adres np. `braingain-production.up.railway.app`

#### 6. Weryfikacja Wdrożenia

1. Wejdź na wygenerowany adres - powinieneś zostać przekierowany na `/student`
2. Wejdź na `/admin`, zaloguj się hasłem z `ADMIN_SECRET`
3. **Test krytyczny**: Dodaj materiał z YouTube (najlepiej bez napisów), aby sprawdzić czy działa `yt-dlp` i transkrypcja przez Groq

### ⚠️ Ważne Uwagi dla Railway

#### System Plików (Efemeryczny)

- Na Railway system plików jest **efemeryczny** - pliki znikają przy każdym redeployu lub restarcie
- Plik `logs/app.log` będzie działał, ale zniknie przy redeployu
- **Rozwiązanie**: Wszystkie logi są również wyświetlane w panelu Railway w zakładce **Logs**
- Logger nadal działa - logi trafiają zarówno do pliku (jak długo serwer działa) jak i do konsoli (widoczne w Railway)

#### yt-dlp na Railway

- `yt-dlp` jest instalowany globalnie przez `pip3` w Dockerfile
- Wszystkie zależności (Python, ffmpeg) są w kontenerze
- **Nie musisz** instalować niczego dodatkowego w Railway

#### Koszty Railway

- **Trial**: $5 kredytów (starczy na ~500-800 godzin działania = ~miesiąc non-stop)
- **Plan Hobby**: Płacisz tylko za zużycie RAM/CPU, przy małym ruchu: ~$5 miesięcznie
- **Zalecenie**: Zacznij od trial i monitoruj zużycie w panelu Railway

### Troubleshooting na Railway

#### Problem: Build się nie udaje

**Rozwiązanie**: 
- Sprawdź logi buildu w Railway (zakładka **Deployments**)
- Upewnij się, że wszystkie zmienne środowiskowe są ustawione
- Sprawdź czy `Dockerfile` jest w katalogu głównym projektu

#### Problem: Aplikacja nie startuje

**Rozwiązanie**:
- Sprawdź logi w zakładce **Logs**
- Upewnij się, że `NODE_ENV=production` jest ustawione
- Sprawdź czy wszystkie wymagane zmienne środowiskowe są ustawione

#### Problem: yt-dlp nie działa

**Rozwiązanie**:
- Sprawdź logi - yt-dlp powinien być zainstalowany przez Dockerfile
- Upewnij się, że Python i pip są dostępne (sprawdź logi buildu)

#### Problem: Transkrypcja przez Groq nie działa

**Rozwiązanie**:
- Sprawdź czy `GROQ_API_KEY` jest ustawiony poprawnie
- Sprawdź logi dla błędów API Groq
- Upewnij się, że plik audio nie przekracza 25 MB (limit Groq)

---

### Alternatywne Platformy

**Vercel** (NIE ZALECANE dla tego projektu):
- ❌ Nie obsłuży `yt-dlp` (brak Pythona, timeouty)
- ❌ Brak możliwości instalacji systemowych bibliotek
- ✅ Działałoby dla podstawowych funkcji (bez transkrypcji audio)

**Railway** (ZALECANE):
- ✅ Pełna kontrola nad środowiskiem (jak VPS)
- ✅ Możliwość instalacji Pythona, ffmpeg, yt-dlp
- ✅ Proste wdrożenie przez GitHub
- ✅ Darmowy trial ($5 kredytów)

---

## 🔧 Jak to Działa

### 1. Dodawanie Materiału YouTube

1. Administrator wchodzi na `/admin` i wprowadza hasło (wartość z `ADMIN_SECRET`)
2. Po zalogowaniu wybiera zakładkę "YouTube"
3. Wkleja URL wideo i opcjonalnie ustawia czas startu
4. Klika "Dodaj materiał"
5. **System próbuje automatycznie pobrać transkrypt w 3 krokach:**
   - **Krok 1**: Próbuje pobrać napisy z YouTube przez `youtubei.js` (najszybsze, darmowe)
   - **Krok 2**: Jeśli napisy nie są dostępne, pobiera audio przez `yt-dlp` i transkrybuje przez **Groq API** (Whisper-large-v3) - dla filmów bez napisów
   - **Krok 3**: Jeśli obie metody nie działają, pokazuje opcję ręcznego wklejenia tekstu
6. Tekst jest walidowany i zapisywany do bazy

### 2. Dodawanie Materiału PDF

1. Administrator wybiera zakładkę "PDF"
2. Wybiera plik PDF (max 5 MB)
3. Opcjonalnie podaje tytuł
4. System parsuje PDF i wyciąga tekst
5. Tekst jest zapisywany do bazy

### 3. Generowanie Quizu (Przyszłość)

1. Uczeń wybiera materiał
2. System wywołuje `generateQuiz(content_text)`
3. OpenAI generuje 10 pytań wielokrotnego wyboru
4. Quiz jest wyświetlany uczniowi
5. Po rozwiązaniu wynik jest zapisywany w `attempts`
6. Jeśli wynik >= 9/10, dodawana jest nagroda w `rewards`

---

## 📚 API i Funkcje

### System Logowania

#### `src/lib/logger.ts`

System logowania automatycznie przechwytuje wszystkie wywołania `console.*` i zapisuje je do pliku `logs/app.log` z zaawansowanymi funkcjami.

**Funkcje loggera:**
- `logger.error(message, data?)` - Loguje błąd
- `logger.warn(message, data?)` - Loguje ostrzeżenie
- `logger.info(message, data?)` - Loguje informację
- `logger.debug(message, data?)` - Loguje debug (tylko w development)

**Automatyczne przechwytywanie:**
- Wszystkie wywołania `console.log`, `console.error`, `console.warn`, `console.info`, `console.debug` są automatycznie przechwytywane
- Komunikaty z bibliotek zewnętrznych (np. YouTube.js) są również zapisywane
- Oryginalne zachowanie console jest zachowane (komunikaty nadal trafiają do konsoli)

**Filtrowanie:**
- Automatyczne ignorowanie nieistotnych komunikatów (source map warnings, itp.)
- Konfigurowalna czarna lista wzorców do ignorowania

**Grupowanie duplikatów:**
- Wykrywa powtarzające się komunikaty w ciągu 5 sekund
- Grupuje je z licznikiem zamiast zapisywać wielokrotnie
- Format: `[Ten komunikat pojawił się X razy w ciągu Ys]`

**Formatowanie:**
- Stack trace jest dzielony na czytelne linie z wcięciami
- Błędy są formatowane z pełnym kontekstem
- Timestamp dla każdego logu

**Automatyczne czyszczenie:**
- Plik logów jest automatycznie przycinany do ostatnich 1000 linii
- Katalog `logs/` jest dodany do `.gitignore`

#### Endpoint API: `/api/logs`

**GET `/api/logs?lines=200&clear=false`**
- `lines` - Liczba ostatnich linii do zwrócenia (domyślnie 100, max 1000)
- `clear=true` - Czyści plik logów

**Odpowiedź:**
```json
{
  "logs": ["[2025-01-28T10:00:00.000Z] [ERROR] Błąd...", ...],
  "count": 200,
  "timestamp": "2025-01-28T10:00:00.000Z"
}
```

**Panel Logów w AdminPanel:**
- Przycisk "Pokaż Logi" w prawym górnym rogu
- Automatyczne odświeżanie co 5 sekund
- Przycisk "Odśwież" do ręcznego odświeżenia
- Przycisk "Wyczyść" do czyszczenia logów
- Wyświetla ostatnie 200 linii w terminalowym stylu (czarne tło, zielony tekst)

**Przykład użycia:**
```typescript
import { logger } from '@/lib/logger';

// Logowanie błędu z kontekstem
logger.error('Błąd pobierania transkryptu YouTube', {
  url: 'https://youtube.com/watch?v=...',
  error: error.message,
  stack: error.stack,
});
```

---

### `src/lib/services.ts`

#### `getYouTubeTranscript(url: string, startSeconds: number): Promise<string | null>`

Pobiera transkrypt z YouTube i filtruje segmenty przed `startSeconds`.

```typescript
const transcript = await getYouTubeTranscript(
  'https://youtube.com/watch?v=...',
  600 // Start od 10 minuty
);
```

#### `getYouTubeTranscriptHybrid(url: string, startSeconds: number)`

Hybrydowe podejście - próbuje automatycznie, zwraca informację o potrzebie ręcznego wklejenia.

```typescript
const result = await getYouTubeTranscriptHybrid(url, 0);
if (result.success) {
  // Użyj result.transcript
} else if (result.requiresManual) {
  // Pokaż opcję ręcznego wklejenia
}
```

#### `processManualText(text: string): Promise<string | null>`

Waliduje i czyści ręcznie wklejony tekst.

```typescript
const cleaned = await processManualText(userText);
if (cleaned) {
  // Tekst jest poprawny (min 100 znaków)
}
```

#### `parsePDF(file: File): Promise<string | null>`

Parsuje PDF i wyciąga tekst.

```typescript
const text = await parsePDF(file);
```

#### `generateQuiz(text: string): Promise<Quiz | null>`

Generuje quiz z 10 pytaniami używając OpenAI. Funkcja implementuje inteligentne wykrywanie materiałów językowych przez API oraz 4 strategie zwiększające różnorodność quizów przy każdym wywołaniu:

**Wykrywanie Materiałów Językowych przez OpenAI (NOWE)**
- System używa dodatkowego wywołania API do analizy typu materiału (koszt: ~$0.0001 za analizę)
- Funkcja `detectLanguageLearningMaterial()`:
  - Analizuje fragment tekstu (~2000 znaków) przez GPT-4o-mini
  - Określa czy materiał dotyczy nauki języka obcego
  - Zwraca poziom pewności (confidence: low/medium/high)
  - Wykrywa język docelowy (np. "angielski", "hiszpański", "niemiecki")
- **Dla materiałów językowych**:
  - Pytania skupiają się na znaczeniu słów i zwrotów w języku obcym
  - Pytania o tłumaczenia (z/na język obcy)
  - Pytania o użycie słownictwa w kontekście
  - Pytania o gramatykę i konstrukcje językowe (czasy, deklinacje, koniugacje)
  - **Blokuje** nieprzydatne pytania typu "Jaki jest klimat filmu", "Jaka jest tematyka"
- **Dla materiałów ogólnych**:
  - Standardowe pytania o fakty, analizy, szczegóły
- **Zalety AI detection vs keyword matching**:
  - Znacznie dokładniejsze rozpoznawanie kontekstu
  - Nie pomyli filmu o językach z lekcją językową
  - Rozpoznaje subtelne sygnały w tekście

**Strategia 1: Wstrzyknięcie losowości do promptu**
- Każde wywołanie generuje unikalny identyfikator (hash) i dodaje go do promptu
- Zmienia to "ścieżkę myślową" AI, wymuszając wybór innych faktów z tekstu

**Strategia 2: Parametry frequency_penalty i presence_penalty**
- `frequency_penalty: 0.3` - Kary za powtarzanie tokenów
- `presence_penalty: 0.7` - Kary za powtarzanie tematów, wymusza sięganie głębiej w tekst

**Strategia 3: Losowanie "Osobowości Egzaminatora"**
- 5 różnych stylów pytań losowanych przy każdym wywołaniu:
  - **Faktograf**: Daty, liczby, nazwy własne
  - **Analityk**: Związki przyczynowo-skutkowe, procesy
  - **Detektyw**: Podchwytliwe pytania o detale
  - **Konceptualista**: Definicje, pojęcia, klasyfikacje
  - **Praktyk**: Zastosowania, przykłady, implikacje

**Strategia 4: Technika "Nadmiarowości i Losowania"**
- Generowanie 18 pytań zamiast 10
- Losowe wybranie 10 pytań z wygenerowanych (Fisher-Yates shuffle)
- Gwarantuje różnorodność nawet jeśli AI zwróci podobne pytania

```typescript
const quiz = await generateQuiz(transcript);
// quiz.pytania - tablica 10 pytań (losowo wybranych z 18 wygenerowanych)
```

### `src/lib/materials.ts`

#### `getMaterials(): Promise<Material[]>`

Pobiera wszystkie materiały z bazy.

#### `addYouTubeMaterial(url: string, startMinutes: number, manualText?: string)`

Dodaje materiał YouTube. Jeśli `manualText` jest podany, używa go zamiast automatycznego pobierania.

#### `addPDFMaterial(file: File, title?: string)`

Dodaje materiał PDF.

#### `deleteMaterial(id: string)`

Usuwa materiał z bazy.

---

## 🚀 Jak Kontynuować Pracę

### Dla Następnego AI Asystenta

1. **Przeczytaj `.cursorrules`** - Zawiera kluczowe zasady projektu
2. **Przeczytaj ten dokument** - Zawiera pełny kontekst
3. **Sprawdź strukturę plików** - Wszystkie komponenty są w `src/`
4. **Użyj Server Actions** - Wszystka logika backendowa jest w `src/lib/`

### ✅ Panel Administratora - Zakończony

Komponent `AdminPanel.tsx` został odtworzony i zawiera:

- ✅ Dwie zakładki: YouTube i PDF
- ✅ Formularz YouTube z polami: URL, start od minuty, opcjonalne ręczne wklejenie tekstu
- ✅ Formularz PDF z file input i opcjonalnym tytułem
- ✅ Lista materiałów z możliwością usunięcia
- ✅ Powiadomienia o sukcesie/błędzie
- ✅ Używa funkcji z `materials.ts` (Server Actions)
- ✅ Responsywny design z Tailwind CSS
- ✅ Ikony z lucide-react

### ✅ Interfejs Ucznia - Zakończony

Wszystkie komponenty interfejsu ucznia zostały zaimplementowane:

- ✅ `src/app/student/page.tsx` - Dashboard z listą materiałów i licznikiem nagród
- ✅ `src/app/student/material/[id]/page.tsx` - Strona materiału z nauką i quizem
- ✅ `src/lib/quiz.ts` - Server Actions dla quizów (cooldown, generowanie, weryfikacja)
- ✅ `src/lib/rewards.ts` - Server Actions dla nagród (suma zgromadzonych minut)
- ✅ System cooldownu z licznikiem odliczającym
- ✅ Animacja confetti przy sukcesie

### Następne Kroki (Opcjonalne Ulepszenia)

#### 1. Cache'owanie Quizów
- Użyj tabeli `quizzes` do cache'owania wygenerowanych quizów
- Unikaj wielokrotnego generowania tego samego quizu dla tego samego materiału

#### 2. Statystyki i Historia
- Strona z historią prób (`/student/history`)
- Wykresy postępów
- Statystyki per materiał

#### 3. System Wydawania Nagród
- Rozszerz tabelę `rewards` o kolumnę `spent` lub stwórz tabelę `redemptions`
- Interfejs do "wydawania" zgromadzonych minut

#### 4. Ulepszenia UI
- Lepsza animacja confetti (biblioteka `canvas-confetti`)
- Dark mode
- Lepsze wskaźniki postępu

### Wzorce do Naśladowania

1. **Server Actions** - Wszystka logika backendowa w `src/lib/` z `'use server'`
2. **Obsługa Błędów** - Zawsze `try/catch` i czytelne komunikaty
3. **TypeScript** - Ścisłe typowanie, interfejsy dla wszystkich struktur
4. **Hybrydowe Podejście** - Automatyczne + fallback ręczny

---

## ⚠️ Znane Problemy i Rozwiązania

### Problem: `DOMMatrix is not defined`

**Przyczyna**: `pdf-parse` próbuje użyć API przeglądarki w Node.js.

**Rozwiązanie**: Użyto lazy loading - `require('pdf-parse')` jest wewnątrz funkcji `parsePDF()`, nie na górze pliku.

### Problem: Transkrypt YouTube nie działa dla polskich materiałów

**Przyczyna**: Niektóre filmy nie mają dostępnych napisów.

**Rozwiązanie**: Zaimplementowano hybrydowe podejście - jeśli automatyczne pobieranie nie działa, administrator może wkleić tekst ręcznie.

### Problem: Zmienne środowiskowe nie są widoczne

**Przyczyna**: Next.js domyślnie szuka `.env.local` w katalogu projektu.

**Rozwiązanie**: Skonfigurowano `next.config.ts`, aby ładował zmienne z katalogu nadrzędnego.

### Problem: Source Map warnings

**Rozwiązanie**: To tylko ostrzeżenia diagnostyczne, nie wpływają na działanie aplikacji. Można zignorować.

### Problem: Błędy parsowania YouTube.js (Type mismatch)

**Status**: ✅ **OBSŁUŻONE** - Błędy są przechwytywane i obsługiwane przez hybrydowe podejście.

**Przyczyna**: Niektóre wideo YouTube mają niestandardową strukturę, która powoduje błędy parsowania w bibliotece `youtubei.js`. To jest normalne i nie oznacza błędu w aplikacji.

**Rozwiązanie**: 
- Błędy parsowania są przechwytywane w `getYouTubeTranscript()` i zwracają `null`
- `getYouTubeTranscriptHybrid()` wykrywa brak transkryptu i zwraca `requiresManual: true`
- UI automatycznie pokazuje pole do ręcznego wklejenia transkryptu
- Błędy są logowane jako `console.warn` zamiast `console.error` dla błędów parsowania

### Problem: Błąd połączenia z Supabase (ENOTFOUND)

**Status**: ✅ **OBSŁUŻONE** - Dodano lepsze komunikaty błędów.

**Przyczyna**: Nieprawidłowy URL Supabase w `.env.local` lub brak połączenia z internetem.

**Rozwiązanie**: 
- Dodano sprawdzanie błędów połączenia w `getMaterials()`, `addYouTubeMaterial()`, `addPDFMaterial()`
- Komunikaty błędów zawierają instrukcje sprawdzenia konfiguracji
- Błędy są rzucane z czytelnymi komunikatami zamiast cichego zwracania pustych wyników

### Problem: AdminPanel.tsx został usunięty

**Status**: ✅ **NAPRAWIONE** - Komponent został odtworzony z pełnym UI.

**Rozwiązanie**: Utworzono kompletny komponent `AdminPanel.tsx` z:
- Zakładkami YouTube/PDF
- Formularzami dodawania materiałów
- Obsługą ręcznego wklejenia transkryptu (fallback)
- Listą materiałów z możliwością usunięcia
- Komunikatami sukcesu/błędu

### Problem: Brak walidacji OPENAI_API_KEY

**Status**: ✅ **NAPRAWIONE** - Dodano walidację przy inicjalizacji.

**Rozwiązanie**: Klient OpenAI jest tworzony z lazy initialization i walidacją klucza API. Błąd jest rzucany natychmiast, jeśli klucz nie jest ustawiony.

### Problem: Debug console.log w kodzie produkcyjnym

**Status**: ✅ **NAPRAWIONE** - Usunięto wszystkie debug logi.

**Rozwiązanie**: Usunięto `console.log` i `console.error` z kodu produkcyjnego w `page.tsx`.

### Problem: Duplikacja funkcji extractVideoId

**Status**: ✅ **NAPRAWIONE** - Ujednolicono funkcję.

**Rozwiązanie**: Funkcja `extractVideoId` jest teraz w osobnym pliku `utils.ts` (bez `'use server'`), ponieważ jest synchroniczna. W Next.js 16 wszystkie eksportowane funkcje z plików `'use server'` muszą być async. Funkcja jest importowana w `services.ts` i `materials.ts`.

### Problem: Brak walidacji rozmiaru tekstu przed wysłaniem do OpenAI

**Status**: ✅ **NAPRAWIONE** - Dodano walidację.

**Rozwiązanie**: Funkcja `generateQuiz` sprawdza rozmiar tekstu przed wysłaniem do OpenAI. Limit: ~472k znaków (z marginesem na prompt i odpowiedź).

### Problem: Brak systemu logowania - trudno debugować błędy

**Status**: ✅ **NAPRAWIONE** - Dodano kompletny system logowania.

**Rozwiązanie**: 
- Utworzono system logowania z automatycznym przechwytywaniem wszystkich wywołań `console.*`
- Wszystkie komunikaty są zapisywane do pliku `logs/app.log`
- Dodano filtrowanie nieistotnych komunikatów (source map warnings)
- Dodano grupowanie duplikatów (wykrywa powtarzające się komunikaty)
- Dodano endpoint API `/api/logs` do odczytu logów
- Dodano panel logów w AdminPanel z automatycznym odświeżaniem
- Wszystkie błędy są teraz dostępne bez kopiowania z konsoli

### Problem: Brak obsługi błędów JSON.parse w generateQuiz

**Status**: ✅ **NAPRAWIONE** - Dodano szczegółową obsługę błędów parsowania JSON.

**Przyczyna**: Jeśli OpenAI zwróci nieprawidłowy JSON mimo `response_format: { type: 'json_object' }`, `JSON.parse()` rzucał wyjątek bez szczegółowej informacji.

**Rozwiązanie**: 
- Dodano try/catch wokół `JSON.parse()` z szczegółowym komunikatem błędu
- Błąd zawiera fragment otrzymanego tekstu dla łatwiejszej diagnostyki

### Problem: Brak autoryzacji w endpointzie /api/logs

**Status**: ✅ **NAPRAWIONE** - Dodano weryfikację ADMIN_SECRET.

**Przyczyna**: Endpoint był publicznie dostępny, każdy mógł czytać i czyścić logi.

**Rozwiązanie**: 
- Dodano weryfikację `ADMIN_SECRET` w endpointzie `/api/logs`
- Secret można przekazać przez query param `secret` lub header `x-admin-secret`
- AdminPanel automatycznie przekazuje secret w zapytaniach
- Brak autoryzacji zwraca błąd 401

### Problem: Duplikacja sekcji w dokumentacji

**Status**: ✅ **NAPRAWIONE** - Usunięto duplikację.

**Rozwiązanie**: Usunięto zduplikowaną sekcję "System Logowania" w DOCUMENTATION.md.

### Problem: trimLogFile usuwa puste linie

**Status**: ✅ **NAPRAWIONE** - Poprawiono zachowanie struktury pliku.

**Przyczyna**: Funkcja `trimLogFile()` filtrowała puste linie, co mogło powodować problemy ze strukturą pliku.

**Rozwiązanie**: 
- Usunięto filtrowanie pustych linii
- Zachowuje ostatnie MAX_LINES linii bez modyfikacji struktury
- Zachowuje końcową pustą linię jeśli była w oryginalnym pliku

### Problem: pdf-parse zwraca obiekt bez właściwości text

**Status**: ✅ **NAPRAWIONE** - Dodano obsługę klasy PDFParse w wersji 2.4.5.

**Przyczyna**: `pdf-parse` w wersji 2.4.5 eksportuje klasę `PDFParse` zamiast funkcji. Moduł zwraca obiekt z kluczami `['PDFParse', 'AbortException', 'FormatError', ...]` zamiast bezpośrednio funkcji. Kod próbował użyć funkcji, która nie istnieje w tej wersji.

**Rozwiązanie**: 
- Dodano obsługę klasy `PDFParse` z wersji 2.4.5
- **Ważne**: `pdf-parse` w wersji 2.4.5 wymaga `Uint8Array` zamiast `Buffer`
- Kod konwertuje `File` na `Uint8Array` przed przekazaniem do `PDFParse`
- Kod próbuje różnych sposobów użycia `PDFParse`:
  1. Wywołanie jako funkcja (bez `new`) - `PDFParse(uint8Array)`
  2. Konstruktor z Uint8Array - `new PDFParse(uint8Array)`
  3. Konstruktor z opcjami - `new PDFParse({ data: uint8Array })` lub `new PDFParse({ buffer: uint8Array })`
  4. Metoda statyczna `parse()` - `PDFParse.parse(uint8Array)`
  5. Fallback do `Buffer` dla starszych wersji, które mogą wymagać `Buffer`
- Po utworzeniu instancji, kod sprawdza różne metody wyciągnięcia tekstu:
  - `instance.parse()` - metoda parse()
  - `instance.getText()` - metoda getText()
  - `instance.text` lub `instance.data` - właściwości
- Dodano obsługę przypadku, gdy `data.doc` zawiera tekst wymagający przetworzenia
- Dodano sprawdzanie metod `getText()`, `getPageText()` w `data.doc`
- Dodano obsługę różnych struktur: `doc.items`, `doc.pages`, `doc.contentItems`
- Dodano szczegółowe logowanie diagnostyczne struktury `data` i `data.doc`
- Jeśli tekst nie zostanie znaleziony, system zwraca czytelny błąd z sugestią użycia ręcznego wklejenia tekstu

**Uwaga**: Jeśli problem nadal występuje, sprawdź logi (`logs/app.log`) dla szczegółowej struktury zwracanego obiektu. Może być konieczne użycie innej biblioteki (np. `pdf2json`) lub innej wersji `pdf-parse`.

### Problem: Build na Railway nie przechodzi - "Missing Supabase environment variables"

**Status**: ✅ **NAPRAWIONE** - Zmodyfikowano `supabase.ts` aby obsługiwał brak zmiennych podczas buildu.

**Przyczyna**: Next.js podczas buildu (`npm run build`) próbuje przetworzyć wszystkie strony i komponenty. Jeśli moduł rzuca błąd podczas importu (np. `supabase.ts` sprawdza zmienne środowiskowe), build się nie powiedzie, nawet jeśli zmienne będą dostępne w runtime (po wdrożeniu).

**Rozwiązanie**: 
- Zmodyfikowano `src/lib/supabase.ts` aby używał placeholderów podczas buildu, jeśli zmienne nie są dostępne
- Sprawdzanie zmiennych odbywa się tylko w runtime (gdy aplikacja działa)
- Build może teraz przejść bez zmiennych środowiskowych - Railway automatycznie ustawi je przed uruchomieniem aplikacji
- W runtime aplikacja nadal wymaga prawidłowych zmiennych i rzuci czytelny błąd, jeśli ich brakuje

**Uwaga**: Podczas buildu możesz zobaczyć ostrzeżenie w konsoli, ale build powinien przejść pomyślnie. Zmienne środowiskowe muszą być ustawione w Railway **przed pierwszym deployem**.

### Problem: Build nie przechodzi - błąd prerenderowania stron z bazą danych

**Status**: ✅ **NAPRAWIONE** - Dodano `export const dynamic = 'force-dynamic'` do stron student.

**Przyczyna**: Next.js podczas buildu próbuje prerenderować (SSG) wszystkie strony, w tym `/student` i `/student/material/[id]`. Te strony wywołują Server Actions (`getMaterials()`, `getTotalRewards()`, itp.) które próbują połączyć się z bazą danych używając placeholderów zamiast prawdziwych zmiennych, co powoduje błąd buildu.

**Rozwiązanie**: 
- Dodano `export const dynamic = 'force-dynamic'` do `src/app/student/page.tsx`
- Dodano `export const dynamic = 'force-dynamic'` do `src/app/student/material/[id]/page.tsx`
- Te strony są teraz renderowane w runtime (po wdrożeniu), nie podczas buildu
- Build może teraz przejść pomyślnie, a strony będą działać poprawnie w runtime z prawdziwymi zmiennymi środowiskowymi

**Uwaga**: `force-dynamic` jest właściwym wyborem dla stron które zawsze wymagają połączenia z bazą danych i nie mogą być statycznie wygenerowane.

### Problem: Błąd "Nieprawidłowa struktura pytania" przy generowaniu quizu

**Status**: ✅ **NAPRAWIONE** - Dodano szczegółowe logowanie i lepszą walidację struktury pytań.

**Przyczyna**: OpenAI czasami zwraca pytania w nieprawidłowej strukturze lub z brakującymi polami. Poprzednia walidacja nie logowała szczegółów, co utrudniało debugowanie.

**Rozwiązanie**: 
- Dodano szczegółowe logowanie błędów walidacji pytań - logi pokazują dokładną strukturę zwróconą przez OpenAI
- Dodano bardziej precyzyjne komunikaty błędów z numerem pytania i szczegółami problemu
- Dodano walidację każdej odpowiedzi (czy jest stringiem, czy nie jest pusta)
- Dodano automatyczną konwersję uzasadnienia do stringa jeśli jest innego typu
- Błędy są teraz logowane z pełnym kontekstem (indeks pytania, typy danych, wartości próbek)

**Debugowanie**: Jeśli nadal występują błędy, sprawdź logi w Railway (zakładka **Logs** lub panel admin → **Pokaż Logi**) - będą zawierały szczegółowe informacje o strukturze pytań zwróconych przez OpenAI.

---

## 📝 Ważne Uwagi

### Bezpieczeństwo

- Panel administratora (`/admin`) jest chroniony przez ekran logowania z hasłem
- Hasło jest weryfikowane przez porównanie z `ADMIN_SECRET` z `.env.local`
- Sesja logowania jest przechowywana w localStorage (klient-side)
- Endpoint `/api/logs` jest chroniony przez weryfikację `ADMIN_SECRET` (query param `secret` lub header `x-admin-secret`)
- **Uwaga**: Dla produkcji rozważ dodanie prawdziwej autoryzacji (np. sesje serwerowe, JWT)
- `ADMIN_SECRET` powinien być długi i losowy

### Koszty

- OpenAI GPT-4o-mini: ~$0.001-0.002 za lekcję (generowanie quizów)
- **Groq API (Whisper-large-v3)**: Bardzo tani lub darmowy w limitach beta (~$0.006 za minutę audio, często darmowy w limitach)
- Supabase: Darmowy plan wystarczy na start
- Vercel: Darmowy plan dla hostingu

### Limity

- PDF: Maksymalnie 10 MB
- Audio dla Groq: Maksymalnie 25 MB (długie filmy mogą wymagać podziału)
- Tekst ręczny: Minimum 100 znaków, maksimum 500k znaków
- Cooldown quizu: 10 minut po nieudanej próbie

---

## 🔗 Przydatne Linki

- [Dokumentacja Next.js](https://nextjs.org/docs)
- [Dokumentacja Supabase](https://supabase.com/docs)
- [OpenAI API](https://platform.openai.com/docs)
- [Groq API](https://console.groq.com/docs) - Transkrypcja audio (Whisper-large-v3)
- [youtubei.js](https://github.com/LuanRT/YouTube.js)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Narzędzie do pobierania audio z YouTube
- [Oryginalna Specyfikacja](./Motywacja%20do%20nauki%20z%20AI%20quizami.md)

---

## 📊 Status Implementacji

| Komponent | Status | Uwagi |
|-----------|--------|-------|
| Backend Services | ✅ | YouTube, PDF, AI - gotowe |
| Server Actions | ✅ | CRUD materiałów - gotowe |
| Baza Danych | ✅ | Migracja SQL - gotowa |
| Panel Admin | ✅ | Kompletny UI z formularzami YouTube/PDF i listą materiałów |
| Interfejs Ucznia | ✅ | Dashboard z kafelkami materiałów i licznikiem nagród |
| System Quizu | ✅ | Generowanie quizów, weryfikacja odpowiedzi, zapis wyników |
| System Nagród | ✅ | Automatyczne dodawanie nagród po zaliczeniu (>= 9/10) |
| Cooldown | ✅ | Blokada 10 minut po nieudanej próbie z licznikiem |

---

## 🎯 Podsumowanie

Projekt **BrainGain** jest **KOMPLETNY** i gotowy do użycia:
- ✅ Pełna logika backendowa (YouTube, PDF, AI)
- ✅ Baza danych skonfigurowana
- ✅ Panel administratora - **KOMPLETNY** (UI + backend)
- ✅ Interfejs ucznia - **KOMPLETNY** (Dashboard + strona materiału)
- ✅ System quizów - **KOMPLETNY** (generowanie, weryfikacja, cooldown)
- ✅ System nagród - **KOMPLETNY** (automatyczne dodawanie po zaliczeniu)
- ✅ Hybrydowe podejście do transkryptów
- ✅ TypeScript z ścisłym typowaniem
- ✅ Walidacja i obsługa błędów
- ✅ System logowania do pliku
- ✅ Ujednolicone funkcje pomocnicze

**Projekt jest gotowy do wdrożenia!** Wszystkie główne funkcjonalności zostały zaimplementowane zgodnie z oryginalną specyfikacją.

---

*Dokumentacja utworzona: 2025-01-28*
*Ostatnia aktualizacja: 2025-12-21*
*Wersja projektu: 0.6.2*

## 🔄 Historia Zmian

### Wersja 0.1.1 (2025-01-28)
- ✅ Odtworzono komponent AdminPanel.tsx z pełnym UI
- ✅ Dodano walidację OPENAI_API_KEY przy inicjalizacji
- ✅ Usunięto debug console.log z kodu produkcyjnego
- ✅ Ujednolicono funkcję extractVideoId (przeniesiona do utils.ts)
- ✅ Dodano walidację rozmiaru tekstu przed wysłaniem do OpenAI
- ✅ Zaktualizowano .cursorrules o instrukcję aktualizacji dokumentacji
- ✅ Naprawiono wszystkie zidentyfikowane problemy
- ✅ Naprawiono błąd: Server Actions must be async (extractVideoId przeniesiona do utils.ts)
- ✅ Poprawiono obsługę błędów Supabase (lepsze komunikaty dla problemów z połączeniem)
- ✅ Poprawiono obsługę błędów YouTube.js (błędy parsowania są normalne i obsługiwane przez fallback)
- ✅ Dodano system logowania do pliku (`logs/app.log`)
- ✅ Dodano automatyczne przechwytywanie wszystkich wywołań `console.*`
- ✅ Dodano filtrowanie nieistotnych komunikatów (source map warnings)
- ✅ Dodano grupowanie duplikatów (wykrywa powtarzające się komunikaty w ciągu 5 sekund)
- ✅ Dodano lepsze formatowanie stack trace (dzieli na czytelne linie)
- ✅ Dodano endpoint API `/api/logs` do odczytu logów
- ✅ Dodano panel logów w AdminPanel z automatycznym odświeżaniem co 5 sekund
- ✅ Wszystkie `console.error/warn` zastąpione loggerem z zapisem do pliku
- ✅ Dodano obsługę błędów JSON.parse w generateQuiz z szczegółowymi komunikatami
- ✅ Dodano autoryzację do endpointu /api/logs (weryfikacja ADMIN_SECRET)
- ✅ Usunięto duplikację sekcji w dokumentacji
- ✅ Poprawiono trimLogFile - zachowuje strukturę pliku bez filtrowania pustych linii

### Wersja 0.1.2 (2025-01-28)
- ✅ Naprawiono brak obsługi błędów JSON.parse w generateQuiz
- ✅ Dodano autoryzację do endpointu /api/logs
- ✅ Usunięto duplikację w dokumentacji
- ✅ Poprawiono trimLogFile w logger.ts

### Wersja 0.2.0 (2025-01-28)
- ✅ Dodano kompletny interfejs ucznia (Dashboard + strona materiału)
- ✅ Zaimplementowano system quizów (`src/lib/quiz.ts`)
  - `checkCooldown()` - sprawdzanie cooldownu po nieudanej próbie
  - `startQuiz()` - generowanie quizu przez OpenAI
  - `submitQuiz()` - weryfikacja odpowiedzi i zapis wyniku
- ✅ Zaimplementowano system nagród (`src/lib/rewards.ts`)
  - `getTotalRewards()` - suma zgromadzonych minut
- ✅ Dodano logikę cooldownu z licznikiem odliczającym (10 minut)
- ✅ Dodano animację confetti przy sukcesie (>= 9/10)
- ✅ Automatyczne dodawanie 30 minut nagrody po zaliczeniu quizu
- ✅ Wyświetlanie statusu materiałów: "Do zrobienia", "Zaliczone", "Zablokowane"
- ✅ Sekcja nauki z iframe YouTube (start od `start_offset`)
- ✅ Interfejs quizu z weryfikacją odpowiedzi i uzasadnieniami

### Wersja 0.2.1 (2025-01-28)
- ✅ Zmieniono sposób wyświetlania quizu - jedno pytanie na raz zamiast wszystkich jednocześnie
- ✅ Dodano timer 30 sekund na każde pytanie
- ✅ Automatyczne przejście do następnego pytania po upływie czasu (pytanie niezaliczone)
- ✅ Przycisk "Następne pytanie" do ręcznego przejścia między pytaniami
- ✅ Przycisk "Pomiń" do pominięcia pytania bez odpowiedzi
- ✅ Wizualny wskaźnik czasu pozostałego na każde pytanie
- ✅ Po zakończeniu quizu wyświetlanie wszystkich pytań z wynikami i uzasadnieniami

### Wersja 0.2.2 (2025-01-28)
- ✅ **Zwiększono różnorodność quizów** - zaimplementowano 4 strategie:
  1. **Wstrzyknięcie losowości do promptu** - Każde wywołanie używa unikalnego identyfikatora (seed), który zmienia "ścieżkę myślową" AI
  2. **Parametry frequency_penalty i presence_penalty** - `frequency_penalty: 0.3`, `presence_penalty: 0.7` wymuszają sięganie głębiej w tekst i unikanie powtarzania tematów
  3. **Losowanie "Osobowości Egzaminatora"** - 5 różnych stylów pytań (Faktograf, Analityk, Detektyw, Konceptualista, Praktyk) losowanych przy każdym wywołaniu
  4. **Technika "Nadmiarowości i Losowania"** - Generowanie 18 pytań, potem losowe wybranie 10 z nich (Fisher-Yates shuffle)
- ✅ Quizy są teraz znacznie bardziej różnorodne przy każdym wywołaniu, nawet dla tego samego materiału

### Wersja 0.3.0 (2025-01-28)
- ✅ **System nagród z możliwością ustawienia przez admina**:
  - Dodano kolumnę `reward_minutes` do tabeli `materials`
  - Admin może ustawić nagrodę w minutach przy dodawaniu materiału (YouTube/PDF)
  - System automatycznie sugeruje wartość nagrody na podstawie czasu trwania materiału
  - Jeśli admin nie ustawi nagrody, system używa automatycznego obliczenia (fallback)
- ✅ **Wyświetlanie nagrody w interfejsie użytkownika**:
  - Dashboard pokazuje nagrodę na każdym kafelku materiału
  - Strona materiału pokazuje nagrodę obok czasu trwania
  - Użytkownik widzi zarówno czas trwania materiału jak i nagrodę za jego zaliczenie
- ✅ **Aktualizacja funkcji**:
  - `addYouTubeMaterial()` i `addPDFMaterial()` przyjmują opcjonalny parametr `rewardMinutes`
  - `submitQuiz()` używa `reward_minutes` z bazy danych zamiast zawsze obliczać
  - `calculateRewardMinutes()` jest teraz eksportowana i używana do sugerowania wartości

### Wersja 0.4.0 (2025-01-28)
- ✅ **Transkrypcja Audio przez Groq API (ASR)** - Rewolucyjna zmiana dla filmów bez napisów:
  - Dodano trójpoziomowe podejście do pobierania transkryptów:
    1. Próba pobrania napisów z YouTube (najszybsze, darmowe)
    2. **NOWE**: Jeśli napisy nie są dostępne → pobieranie audio przez `yt-dlp` i transkrypcja przez Groq API (Whisper-large-v3)
    3. Fallback do ręcznego wklejenia
  - Dodano moduł `src/lib/groq-transcription.ts` z funkcjami:
    - `downloadYouTubeAudio()` - Pobiera audio z YouTube używając yt-dlp
    - `transcribeWithGroq()` - Transkrybuje plik audio przez Groq API
    - `getYouTubeTranscriptWithGroq()` - Kompletna funkcja łącząca oba kroki
  - Zaktualizowano `getYouTubeTranscriptHybrid()` aby automatycznie używało Groq jako fallback
  - **Korzyści**: System może teraz transkrybować filmy bez napisów, niszowe polskie filmy, filmy z auto-generowanymi napisami
  - **Jakość**: Whisper-large-v3 radzi sobie wybitnie z językiem polskim, akcentami, szumem w tle
  - **Szybkość**: Groq API jest ekstremalnie szybkie (godzinny film w kilkanaście sekund)
- ✅ **Dodano zależności**:
  - `groq-sdk` - SDK do Groq API
  - `yt-dlp-wrap` - Wrapper dla yt-dlp do pobierania audio
- ✅ **Zaktualizowano konfigurację**:
  - Dodano `yt-dlp-wrap` do `serverExternalPackages` w `next.config.ts`
  - Wymagane: `GROQ_API_KEY` w `.env.local`
  - Wymagane: zainstalowany `yt-dlp` w systemie

### Wersja 0.5.0 (2025-01-28)
- ✅ **Zmiana struktury routingu administratora**:
  - Usunięto dynamiczny route `/admin/[secret]`
  - Panel administratora jest teraz dostępny pod `/admin` (bez sekretu w URL)
  - Dodano ekran logowania z hasłem (zasłaniający ekran)
  - Hasło jest weryfikowane przez porównanie z `ADMIN_SECRET` z `.env.local`
  - Sesja logowania jest przechowywana w localStorage
  - Przycisk "Wyloguj się" w prawym górnym rogu panelu
- ✅ **Zmiana strony głównej**:
  - Strona główna (`/`) automatycznie przekierowuje na `/student`
  - Użytkownicy trafiają bezpośrednio na dashboard ucznia
- ✅ **Zaktualizowano strukturę plików**:
  - Przeniesiono `AdminPanel.tsx` z `/admin/[secret]/` do `/admin/`
  - Utworzono nowy `/admin/page.tsx` z ekranem logowania
  - Usunięto folder `/admin/[secret]/`

### Wersja 0.6.0 (2025-12-07)
- ✅ **Przygotowanie do wdrożenia na Railway**:
  - Dodano `Dockerfile` z pełną konfiguracją środowiska (Node.js 18, Python 3, ffmpeg, yt-dlp)
  - Dodano `.dockerignore` aby zoptymalizować proces buildu
  - Zaktualizowano `next.config.ts` - ładowanie `.env.local` tylko w development (produkcja używa zmiennych środowiskowych)
  - **Naprawiono problem z buildem**: 
    - `supabase.ts` używa teraz placeholderów podczas buildu, aby build mógł przejść bez zmiennych środowiskowych
    - Dodano `export const dynamic = 'force-dynamic'` do stron `/student` i `/student/material/[id]` aby uniknąć prerenderowania podczas buildu
  - **Naprawiono błędy walidacji quizów**: 
    - Dodano szczegółowe logowanie błędów walidacji pytań z pełnym kontekstem
    - Ulepszono komunikaty błędów - pokazują numer pytania i szczegóły problemu
    - Dodano walidację każdej odpowiedzi i automatyczną konwersję uzasadnienia
  - Zaktualizowano `.gitignore` aby pozwolić na commit `logs/.gitkeep` (zachowanie struktury katalogu)
  - Dodano szczegółową dokumentację wdrożenia na Railway w `DOCUMENTATION.md`
  - Projekt gotowy do wdrożenia na Railway bez dodatkowej konfiguracji

### Wersja 0.6.1 (2025-12-21)
- ✅ **Inteligentne wykrywanie materiałów językowych przez OpenAI API**:
  - Dodano funkcję `detectLanguageLearningMaterial()` wykorzystującą GPT-4o-mini
  - System analizuje fragment tekstu (~2000 znaków) przed wygenerowaniem quizu
  - Określa czy materiał dotyczy nauki języka obcego (confidence: low/medium/high)
  - Wykrywa język docelowy (angielski, hiszpański, niemiecki, itp.)
  - **Zalety AI detection**:
    - Znacznie dokładniejsze niż keyword matching
    - Rozumie kontekst (nie pomyli filmu o językach z lekcją językową)
    - Rozpoznaje subtelne sygnały w treści
  - **Koszt**: Dodatkowe ~$0.0001 za każdy quiz (fragment 2000 znaków + mała odpowiedź JSON)
  - **Dla materiałów językowych quiz generuje pytania o**:
    - Znaczenie słów i zwrotów w języku obcym (np. "Co znaczy zwrot X?")
    - Tłumaczenia z języka obcego na polski i odwrotnie
    - Użycie słownictwa w kontekście
    - Konstrukcje gramatyczne i zasady wymowy (czasy, deklinacje, koniugacje)
  - **Blokuje nieprzydatne pytania** typu:
    - "Jaki jest ogólny klimat filmu?"
    - "Jaka jest główna tematyka materiału?"
    - Pytania o nastrój, atmosferę lub kontekst produkcji
  - **Dla materiałów nielingwistycznych** zachowuje standardowy tryb pytań (fakty, analizy, szczegóły)
  - Zmiana poprawia jakość quizów dla filmów edukacyjnych o nauce języków obcych

### Wersja 0.6.2 (2025-12-21)
- ✅ **Aktualizacja bezpieczeństwa Next.js**:
  - Zaktualizowano Next.js z 16.0.5 do 16.0.10 (łatanie krytycznych luk bezpieczeństwa)
  - Naprawiono CVE-2025-55183 (MEDIUM), CVE-2025-55184 (HIGH), CVE-2025-66478 (CRITICAL), CVE-2025-67779 (HIGH)
  - Zaktualizowano eslint-config-next z 16.0.5 do 16.0.10 (kompatybilność)
  - Wszystkie zależności przetestowane: 0 vulnerabilities
  - Projekt gotowy do deploymentu na Railway

