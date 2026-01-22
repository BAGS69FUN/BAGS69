// app/api/presale/[id]/launch/route.ts
// Launch token when presale is full
// Uses shared launch function

import { NextResponse } from 'next/server';
import { 
  getPresaleById, 
  checkAutoLaunch,
} from '@/lib/presale-db';
import { launchPresaleToken } from '@/lib/launch-presale';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST - Launch the token (automatic - no creator signature needed)
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const { force } = body; // Allow force launch for testing
    
    console.log('[Launch API] Launching presale:', id, 'force:', force);
    
    // Call the shared launch function
    const result = await launchPresaleToken(id, force);
    
    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        step: result.step,
        token_mint: result.token_mint,
        meteora_config_key: result.meteora_config_key,
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: true,
      message: '🚀 Token launched successfully!',
      token_mint: result.token_mint,
      launch_signature: result.launch_signature,
      meteora_config_key: result.meteora_config_key,
      bags_url: result.bags_url,
      explorer_url: result.explorer_url,
    });
    
  } catch (e: any) {
    console.error('[Launch API] Error:', e.message);
    return NextResponse.json({
      success: false,
      error: e.message,
    }, { status: 500 });
  }
}

// GET - Check launch status
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    const presale = await getPresaleById(id);
    
    if (!presale) {
      return NextResponse.json({
        success: false,
        error: 'Presale not found',
      }, { status: 404 });
    }
    
    const readyToLaunch = await checkAutoLaunch(id);
    
    return NextResponse.json({
      success: true,
      status: presale.status,
      is_full: presale.participant_count >= presale.target_participants,
      participant_count: presale.participant_count,
      target: presale.target_participants,
      max_wallets: presale.target_participants + 1, // participants + creator
      token_mint: presale.token_mint,
      can_launch: readyToLaunch,
      auto_launch: true, // This presale system uses automatic launches
    });
    
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      error: e.message,
    }, { status: 500 });
  }
}
