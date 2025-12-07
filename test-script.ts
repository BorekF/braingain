/**
 * Tymczasowy skrypt testowy dla getYouTubeTranscript
 * 
 * Instalacja zależności (jeśli nie masz):
 * npm install -D tsx dotenv
 * 
 * Uruchomienie:
 * npx tsx test-script.ts
 * 
 * LUB jeśli masz tsx zainstalowany globalnie:
 * tsx test-script.ts
 */

// WAŻNE: Używamy require() dla dotenv, aby załadować zmienne SYNCHRONICZNIE
// przed jakimikolwiek importami (które są "hoisted" i wykonują się najpierw)
const { resolve } = require('path');
const { config } = require('dotenv');

// Ładuj .env.local - plik jest w katalogu nadrzędnym (główny folder projektu)
// Struktura: c:\projekty\braingain\.env.local (główny folder)
//           c:\projekty\braingain\braingain\test-script.ts (tutaj jesteśmy)
const envPath = resolve(process.cwd(), '..', '.env.local');
const result = config({ path: envPath });

if (result.error) {
  console.warn(`⚠️  Nie udało się załadować .env.local z: ${envPath}`);
  console.warn(`   Błąd: ${result.error.message}`);
} else {
  console.log(`✅ Załadowano zmienne z: ${envPath}`);
  const apiKey = process.env.OPENAI_API_KEY;
  console.log(`   OPENAI_API_KEY: ${apiKey ? `✅ ustawiony (${apiKey.substring(0, 10)}...)` : '❌ brak'}`);
}

async function testYouTubeTranscript() {
  // Dynamiczny import services.ts PO załadowaniu zmiennych środowiskowych
  const { getYouTubeTranscript } = await import('./src/lib/services');
  
  console.log('🧪 Testowanie getYouTubeTranscript...\n');

  // Przykładowe wideo YouTube (krótkie, edukacyjne)
  const testUrl = 'https://www.youtube.com/watch?v=MUq5TBAVCmE';
  const startSeconds = 0; // Zacznij od początku

  console.log(`📹 URL: ${testUrl}`);
  console.log(`⏱️  Start od: ${startSeconds} sekundy\n`);

  try {
    console.log('⏳ Pobieranie transkryptu...');
    const transcript = await getYouTubeTranscript(testUrl, startSeconds);

    if (transcript) {
      console.log('✅ Sukces! Transkrypt pobrany.\n');
      console.log('📝 Fragment transkryptu (pierwsze 500 znaków):');
      console.log('─'.repeat(60));
      console.log(transcript.substring(0, 500));
      console.log('─'.repeat(60));
      console.log(`\n📊 Długość transkryptu: ${transcript.length} znaków`);
    } else {
      console.log('❌ Błąd: Funkcja zwróciła null');
      console.log('💡 To oznacza, że transkrypt nie jest dostępny lub wystąpił błąd.');
    }
  } catch (error) {
    console.error('❌ Błąd podczas testowania:');
    console.error(error);
  }
}

// Uruchom test
testYouTubeTranscript()
  .then(() => {
    console.log('\n✨ Test zakończony');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Nieoczekiwany błąd:');
    console.error(error);
    process.exit(1);
  });

