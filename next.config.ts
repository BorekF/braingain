import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "path";

// Ładuj .env.local z katalogu nadrzędnego TYLKO w środowisku lokalnym (development)
// W produkcji (Railway, Vercel itp.) zmienne środowiskowe są już ustawione bezpośrednio
// Struktura lokalna: c:\projekty\braingain\.env.local (główny folder)
//                   c:\projekty\braingain\braingain\next.config.ts (tutaj jesteśmy)
if (process.env.NODE_ENV !== 'production') {
  const envPath = resolve(__dirname, "..", ".env.local");
  config({ path: envPath });
}

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Zwiększony limit dla Server Actions (domyślnie 1 MB)
    },
  },
  // pdf-parse i yt-dlp-wrap muszą być traktowane jako zewnętrzne pakiety serwerowe
  // aby uniknąć problemów z bundlowaniem przez Next.js
  serverExternalPackages: ['pdf-parse', 'yt-dlp-wrap'],
};

export default nextConfig;
