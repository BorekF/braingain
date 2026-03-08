import { NextResponse } from 'next/server';
import { getRecentLogs, clearLogs } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const adminSecret = process.env.ADMIN_SECRET;
    const providedSecret = searchParams.get('secret') || request.headers.get('x-admin-secret');

    if (!adminSecret) {
      return NextResponse.json(
        { error: 'ADMIN_SECRET is not configured' },
        { status: 500 }
      );
    }

    if (providedSecret !== adminSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const lines = parseInt(searchParams.get('lines') || '100', 10);
    const clear = searchParams.get('clear') === 'true';
    const maxLines = Math.min(lines, 1000);

    if (clear) {
      clearLogs();
      return NextResponse.json({ message: 'Logs have been cleared' });
    }

    const logs = getRecentLogs(maxLines);

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown';
    return NextResponse.json(
      { error: 'Failed to read logs', details: message },
      { status: 500 }
    );
  }
}

