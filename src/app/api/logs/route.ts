import { NextResponse } from 'next/server';
import { getRecentLogs, clearLogs } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    // Weryfikacja autoryzacji - sprawdź ADMIN_SECRET w nagłówku lub query param
    const { searchParams } = new URL(request.url);
    const adminSecret = process.env.ADMIN_SECRET;
    const providedSecret = searchParams.get('secret') || request.headers.get('x-admin-secret');

    if (!adminSecret) {
      return NextResponse.json(
        { error: 'Brak konfiguracji ADMIN_SECRET' },
        { status: 500 }
      );
    }

    if (providedSecret !== adminSecret) {
      return NextResponse.json(
        { error: 'Brak autoryzacji' },
        { status: 401 }
      );
    }

    const lines = parseInt(searchParams.get('lines') || '100', 10);
    const clear = searchParams.get('clear') === 'true';

    // Maksymalnie 1000 linii
    const maxLines = Math.min(lines, 1000);

    if (clear) {
      clearLogs();
      return NextResponse.json({ message: 'Logi zostały wyczyszczone' });
    }

    const logs = getRecentLogs(maxLines);
    
    // Debug info
    const debugInfo = process.env.NODE_ENV === 'development' ? {
      logFile: process.cwd() + '/logs/app.log',
      cwd: process.cwd(),
    } : {};
    
    return NextResponse.json({
      logs,
      count: logs.length,
      timestamp: new Date().toISOString(),
      ...debugInfo,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Błąd odczytu logów', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

