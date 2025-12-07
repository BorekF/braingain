import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Podczas buildu Next.js może nie mieć dostępu do zmiennych środowiskowych
// Używamy placeholderów, aby build mógł przejść
// W runtime (gdy aplikacja działa) zmienne MUSZĄ być ustawione
const url = supabaseUrl || 'https://placeholder.supabase.co';
const key = supabaseAnonKey || 'placeholder-key';

// Tworzymy klienta - jeśli brakuje zmiennych, użyje placeholderów
// Błąd zostanie rzucony dopiero przy próbie użycia klienta w runtime
export const supabase = createClient(url, key);

// Sprawdzamy zmienne tylko w runtime (nie podczas buildu)
// Jeśli brakuje zmiennych, funkcje które używają supabase rzucą błąd z bardziej czytelnym komunikatem
if (typeof window !== 'undefined' || process.env.NODE_ENV === 'production') {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      '⚠️ Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set'
    );
  }
}


