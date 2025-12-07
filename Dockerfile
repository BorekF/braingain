# ZMIANA: Podbijamy wersję Node do 20 (wymagane przez nowy Next.js)
FROM node:20-slim

# 1. Instalacja zależności systemowych
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
    git \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 2. Instalacja yt-dlp z flagą naprawiającą błąd (to już masz dobrze)
RUN pip3 install --no-cache-dir yt-dlp --break-system-packages

# 3. Ustawienie katalogu roboczego
WORKDIR /app

# 4. Kopiowanie plików package
COPY package*.json ./

# 5. Instalacja zależności
RUN npm ci

# 6. Kopiowanie reszty plików
COPY . .

# 7. Budowanie aplikacji Next.js
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# 8. Utworzenie katalogu na logi
RUN mkdir -p /app/logs

# 9. Uruchomienie aplikacji
EXPOSE 3000
ENV PORT=3000

CMD ["npm", "start"]