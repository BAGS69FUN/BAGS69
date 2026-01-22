// app/api/presale/stats/route.ts
// Get presale statistics for the homepage

import { NextResponse } from 'next/server';
import { getPresaleStats } from '@/lib/presale-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stats = await getPresaleStats();
    
    return NextResponse.json({
      success: true,
      stats: {
        total_presales: stats.total,
        active_presales: stats.active,
        launched_tokens: stats.launched,
        total_sol_raised: stats.total_sol || 0,
      },
    });
    
  } catch (e: any) {
    console.error('[Presale Stats] Error:', e.message);
    return NextResponse.json({
      success: true,
      stats: {
        total_presales: 0,
        active_presales: 0,
        launched_tokens: 0,
        total_sol_raised: 0,
      },
    });
  }
}
