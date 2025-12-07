# Supabase Setup Guide dla BrainGain

Ten przewodnik przeprowadzi Cię przez konfigurację Supabase dla projektu BrainGain.

## Krok 1: Utworzenie projektu w Supabase

1. Przejdź na [supabase.com](https://supabase.com)
2. Zaloguj się lub utwórz konto (darmowe)
3. Kliknij **"New Project"**
4. Wypełnij formularz:
   - **Name**: `braingain` (lub dowolna nazwa)
   - **Database Password**: Wygeneruj silne hasło i **ZAPISZ JE** (będzie potrzebne później)
   - **Region**: Wybierz najbliższą lokalizację (np. `West Europe`)
5. Kliknij **"Create new project"**
6. Poczekaj 2-3 minuty na utworzenie projektu

## Krok 2: Uruchomienie migracji SQL

### Dla nowych projektów:

1. W panelu Supabase przejdź do **SQL Editor** (ikona w lewym menu)
2. Kliknij **"New query"**
3. Skopiuj całą zawartość pliku `migration.sql`
4. Wklej do edytora SQL
5. Kliknij **"Run"** (lub naciśnij `Ctrl+Enter`)
6. Sprawdź czy pojawił się komunikat sukcesu: `Success. No rows returned`

### Dla istniejących projektów (dodanie kolumny reward_minutes):

Jeśli masz już istniejącą bazę danych i chcesz dodać kolumnę `reward_minutes`:

1. W panelu Supabase przejdź do **SQL Editor**
2. Kliknij **"New query"**
3. Skopiuj zawartość pliku `add_reward_minutes.sql`
4. Wklej do edytora SQL
5. Kliknij **"Run"**
6. Sprawdź czy kolumna została dodana (zapytanie na końcu zwróci informacje o kolumnie)

## Krok 3: Utworzenie Storage Bucket

1. W panelu Supabase przejdź do **Storage** (ikona w lewym menu)
2. Kliknij **"Create a new bucket"**
3. Wypełnij formularz:
   - **Name**: `documents`
   - **Public bucket**: ✅ **TAK** (zaznacz, aby pliki PDF były dostępne publicznie)
4. Kliknij **"Create bucket"**

### Konfiguracja polityki Storage (WYMAGANE)

Aby umożliwić publiczny dostęp do plików (odczyt i zapis):

1. W Storage kliknij na bucket `documents`
2. Przejdź do zakładki **"Policies"**
3. Kliknij **"New Policy"** (dwa razy - raz dla odczytu, raz dla zapisu)

#### Polityka 1: Publiczny dostęp do odczytu (SELECT)

1. Wybierz **"For full customization"**
2. Wklej poniższą politykę:

```sql
-- Polityka: Publiczny dostęp do odczytu
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents');
```

3. Kliknij **"Review"** i **"Save policy"**

#### Polityka 2: Publiczny dostęp do zapisu (INSERT)

1. Kliknij **"New Policy"** ponownie
2. Wybierz **"For full customization"**
3. Wklej poniższą politykę:

```sql
-- Polityka: Publiczny dostęp do zapisu
CREATE POLICY "Public Write Access"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documents');
```

4. Kliknij **"Review"** i **"Save policy"**

**WAŻNE**: Bez tych polityk nie będzie możliwe zapisywanie plików PDF do Storage!

## Krok 4: Pobranie kluczy API

1. W panelu Supabase przejdź do **Settings** (ikona koła zębatego)
2. Wybierz **"API"** z lewego menu
3. Znajdź sekcję **"Project API keys"**
4. Skopiuj następujące wartości:
   - **`anon` `public`** key - będzie używany w aplikacji Next.js
   - **`service_role` `secret`** key - **NIE UDOSTĘPNIAJ TEGO** (tylko do użycia po stronie serwera, jeśli potrzebne)

5. Znajdź również **"Project URL"** (np. `https://xxxxx.supabase.co`)

## Krok 5: Konfiguracja zmiennych środowiskowych

1. W głównym katalogu projektu (`braingain/`) utwórz plik `.env.local`
2. Dodaj następujące zmienne:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=twoj_anon_key_tutaj

# OpenAI (będzie potrzebne później)
OPENAI_API_KEY=twoj_openai_key_tutaj

# Admin Secret (dla panelu administratora)
ADMIN_SECRET=bardzo_dlugi_i_losowy_ciag_znakow_ktorego_nie_zgadnie_nikt
```

3. **WAŻNE**: Plik `.env.local` jest już w `.gitignore`, więc nie zostanie wrzucony do repozytorium

## Krok 6: Weryfikacja setupu

Uruchom następujące zapytanie w SQL Editor, aby sprawdzić czy wszystko działa:

```sql
-- Sprawdź tabele
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('materials', 'attempts', 'rewards', 'quizzes');

-- Sprawdź bucket
SELECT name, public 
FROM storage.buckets 
WHERE name = 'documents';
```

Oba zapytania powinny zwrócić wyniki.

## Krok 7: Test połączenia (opcjonalne)

Możesz przetestować połączenie z Supabase w kodzie Next.js:

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

## Troubleshooting

### Problem: "relation already exists"
- Rozwiązanie: Tabele już istnieją. Możesz je usunąć ręcznie lub użyć `DROP TABLE IF EXISTS` przed `CREATE TABLE`

### Problem: "permission denied for schema storage"
- Rozwiązanie: Upewnij się, że jesteś zalogowany jako właściciel projektu

### Problem: Bucket nie jest publiczny
- Rozwiązanie: Sprawdź ustawienia bucketu i polityki w zakładce Storage > Policies

### Problem: "new row violates row-level security policy" przy zapisie pliku PDF
- **Rozwiązanie**: Musisz dodać politykę RLS dla INSERT w Storage. Zobacz sekcję "Konfiguracja polityki Storage" powyżej.
- Upewnij się, że masz **dwie** polityki:
  1. `Public Read Access` - dla SELECT (odczyt)
  2. `Public Write Access` - dla INSERT (zapis)

### Problem: Nie widzę tabel w Table Editor
- Rozwiązanie: Odśwież stronę lub sprawdź czy migracja się powiodła w SQL Editor

## Następne kroki

Po zakończeniu setupu możesz:
1. Przejść do implementacji serwisów (Etap 2 z dokumentacji)
2. Utworzyć interfejs administratora (Etap 3)
3. Utworzyć interfejs ucznia (Etap 4)

## Przydatne linki

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Supabase Storage](https://supabase.com/docs/guides/storage)


