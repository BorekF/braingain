# Używamy lekkiej wersji Node.js opartej na Debianie (stabilniejsza dla Python/ffmpeg niż Alpine)
FROM node:18-slim

# 1. Instalacja zależności systemowych wymaganych przez BrainGain
# - python3 i pip: potrzebne dla yt-dlp
# - ffmpeg: potrzebny do przetwarzania audio
# - ca-certificates: dla bezpiecznych połączeń HTTPS
# - git: może być potrzebny dla niektórych zależności Node.js
# - wget/curl: pomocne przy debugowaniu
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
    git \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 2. Instalacja yt-dlp globalnie (wymagane przez yt-dlp-wrap)
# Używamy pip3 do instalacji yt-dlp jako globalnego narzędzia
RUN pip3 install --no-cache-dir yt-dlp

# 3. Ustawienie katalogu roboczego
WORKDIR /app

# 4. Kopiowanie plików package.json i package-lock.json
COPY package*.json ./

# 5. Instalacja zależności Node.js (wszystkie, w tym devDependencies potrzebne do buildu)
RUN npm ci

# 6. Kopiowanie reszty plików projektu
COPY . .

# 7. Budowanie aplikacji Next.js
# Wyłączamy telemetrię Next.js dla prywatności i szybkości
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Buduj aplikację
RUN npm run build

# 8. Utworzenie katalogu na logi (dla logger.ts)
RUN mkdir -p /app/logs

# 9. Uruchomienie aplikacji
EXPOSE 3000

# Railway automatycznie ustawia PORT, więc używamy zmiennej środowiskowej
ENV PORT=3000

CMD ["npm", "start"]

