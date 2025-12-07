# Konfiguracja Groq API dla Transkrypcji Audio

Ten dokument opisuje jak skonfigurować Groq API do automatycznej transkrypcji audio z filmów YouTube, które nie mają dostępnych napisów.

## 📋 Wymagania

1. **Konto Groq** - Zarejestruj się na [console.groq.com](https://console.groq.com)
2. **Klucz API Groq** - Utwórz klucz API w panelu Groq
3. **yt-dlp** - Narzędzie do pobierania audio z YouTube (musi być zainstalowane w systemie)
4. **ffmpeg NIE jest wymagany** - System pobiera audio bezpośrednio w formacie, który YouTube oferuje (m4a, opus), bez konwersji

## 🔧 Instalacja yt-dlp

### Windows

**Opcja 1: Przez pip (jeśli masz Python)**
```bash
pip install yt-dlp
```

**Opcja 2: Pobierz plik wykonywalny**
1. Pobierz najnowszą wersję z [GitHub Releases](https://github.com/yt-dlp/yt-dlp/releases)
2. Pobierz plik `yt-dlp.exe`
3. Umieść go w folderze, który jest w PATH (np. `C:\Windows\System32`) lub dodaj folder do PATH

**Opcja 3: Przez Chocolatey**
```bash
choco install yt-dlp
```

### macOS

```bash
brew install yt-dlp
```

### Linux

```bash
# Ubuntu/Debian
sudo apt install yt-dlp

# Lub przez pip
pip install yt-dlp
```

## 🔑 Konfiguracja Klucza API

1. **Zarejestruj się na Groq**:
   - Wejdź na [console.groq.com](https://console.groq.com)
   - Zarejestruj się (możesz użyć konta Google/GitHub)

2. **Utwórz klucz API**:
   - W panelu Groq, przejdź do sekcji "API Keys"
   - Kliknij "Create API Key"
   - Skopiuj wygenerowany klucz

3. **Dodaj klucz do `.env.local`**:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   ```

   **Uwaga**: Plik `.env.local` powinien być w katalogu głównym projektu (tam gdzie jest `Motywacja do nauki z AI quizami.md`), nie w folderze `braingain/`.

## ✅ Weryfikacja Instalacji

### Sprawdź czy yt-dlp jest zainstalowany:

```bash
yt-dlp --version
```

Powinieneś zobaczyć numer wersji, np. `2024.01.07`.

### Sprawdź czy klucz API jest ustawiony:

Uruchom aplikację i spróbuj dodać materiał YouTube bez napisów. System automatycznie użyje Groq API jako fallback.

## 🎯 Jak to Działa

1. **Krok 1**: System próbuje pobrać napisy z YouTube (najszybsze, darmowe)
2. **Krok 2**: Jeśli napisy nie są dostępne:
   - Pobiera audio z YouTube używając `yt-dlp`
   - Wysyła plik audio do Groq API (model Whisper-large-v3)
   - Otrzymuje transkrypt z timestampami
   - Filtruje segmenty po czasie startu (jeśli ustawiono)
3. **Krok 3**: Jeśli obie metody nie działają, pokazuje opcję ręcznego wklejenia

## 💰 Koszty

Groq API oferuje bardzo tanie transkrypcje:
- **Cena**: ~$0.006 za minutę audio
- **Często darmowe** w limitach beta
- **Szybkość**: Ekstremalnie szybkie (godzinny film w kilkanaście sekund)

## ⚠️ Limity

- **Rozmiar pliku**: Maksymalnie 25 MB (długie filmy mogą wymagać podziału)
- **Format audio**: MP3, WAV, M4A (yt-dlp automatycznie konwertuje)
- **Jakość audio**: System pobiera audio w niskiej jakości (wystarczającej dla mowy) aby zmniejszyć rozmiar pliku

## 🐛 Rozwiązywanie Problemów

### Problem: "yt-dlp nie jest rozpoznawany jako polecenie"

**Rozwiązanie**: 
- Upewnij się, że `yt-dlp` jest zainstalowany i dostępny w PATH
- W Windows, możesz użyć pełnej ścieżki do `yt-dlp.exe` w kodzie (wymaga modyfikacji `groq-transcription.ts`)

### Problem: "GROQ_API_KEY nie jest ustawiony"

**Rozwiązanie**:
- Sprawdź czy klucz jest w `.env.local` w katalogu głównym projektu
- Upewnij się, że klucz nie ma spacji ani cudzysłowów
- Zrestartuj serwer deweloperski (`npm run dev`)

### Problem: "Błąd pobierania audio z YouTube"

**Rozwiązanie**:
- Sprawdź czy film jest dostępny publicznie
- Niektóre filmy mogą być zablokowane geograficznie
- Spróbuj zaktualizować `yt-dlp`: `pip install --upgrade yt-dlp`
- **Uwaga**: System nie wymaga `ffmpeg` - pobiera audio bezpośrednio w formacie m4a/opus, który Groq akceptuje

### Problem: "Plik audio jest zbyt duży (25 MB)"

**Rozwiązanie**:
- System automatycznie pobiera audio w niskiej jakości (wystarczającej dla mowy)
- Dla bardzo długich filmów (>2 godziny), rozważ podział na części
- Możesz też użyć ręcznego wklejenia transkryptu

## 📚 Przydatne Linki

- [Groq Console](https://console.groq.com) - Panel zarządzania API
- [Groq API Dokumentacja](https://console.groq.com/docs) - Dokumentacja API
- [yt-dlp GitHub](https://github.com/yt-dlp/yt-dlp) - Repozytorium yt-dlp
- [yt-dlp Dokumentacja](https://github.com/yt-dlp/yt-dlp#readme) - Dokumentacja yt-dlp

## 🎉 Gotowe!

Po skonfigurowaniu, system automatycznie użyje Groq API dla filmów bez napisów. Nie musisz nic więcej robić - wszystko działa automatycznie!

