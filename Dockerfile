# Używamy lekkiej wersji Node.js opartej na Debianie
FROM node:18-slim

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

# 2. NAPRAWA BŁĘDU: Instalacja yt-dlp z flagą --break-system-packages
# To jest konieczne w Debianie 12 (Bookworm), na którym stoi node:18-slim
RUN pip3 install --no-cache-dir yt-dlp --break-system-packages

# 3. Ustawienie katalogu roboczego
WORKDIR /app

# 4. Kopiowanie plików package
COPY package*.json ./

# 5. Instalacja zależności (npm ci jest szybsze i pewniejsze przy buildach)
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