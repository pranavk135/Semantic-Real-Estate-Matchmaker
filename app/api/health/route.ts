import { NextResponse } from 'next/server';
import { checkHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await checkHealth();
  return NextResponse.json(status, { status: status.postgres.ok ? 200 : 503 });
}
