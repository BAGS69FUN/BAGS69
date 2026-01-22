// app/api/presale/[id]/route.ts
// Get presale details, join presale

import { NextResponse } from 'next/server';
import { 
  getPresaleById, 
  getPresaleParticipants,
  getParticipantByWallet,
  checkExpiredPresales,
} from '@/lib/presale-db';
import { ESCROW_WALLET } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET - Get presale details
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // Check for expired presales
    await checkExpiredPresales();
    
    const presale = await getPresaleById(id);
    
    if (!presale) {
      return NextResponse.json({
        success: false,
        error: 'Presale not found',
      }, { status: 404 });
    }
    
    // Get participants
    const participants = await getPresaleParticipants(id);
    
    // Calculate time remaining
    const now = new Date();
    const expiresAt = new Date(presale.expires_at);
    const timeRemainingMs = Math.max(0, expiresAt.getTime() - now.getTime());
    const timeRemainingSeconds = Math.floor(timeRemainingMs / 1000);
    
    // Check if expired but not yet marked
    const isExpired = presale.status === 'active' && timeRemainingMs <= 0;
    
    return NextResponse.json({
      success: true,
      presale: {
        id: presale.id,
        creator_wallet: presale.creator_wallet,
        token_name: presale.token_name,
        token_symbol: presale.token_symbol,
        description: presale.description,
        image_url: presale.image_url,
        twitter: presale.twitter,
        website: presale.website,
        min_sol: presale.min_sol_per_wallet,
        max_sol: presale.max_sol_per_wallet,
        target_participants: presale.target_participants,
        status: isExpired ? 'failed' : presale.status,
        created_at: presale.created_at,
        expires_at: presale.expires_at,
        time_remaining_seconds: timeRemainingSeconds,
        total_sol: presale.total_sol,
        participant_count: presale.participant_count,
        progress_percent: Math.round((presale.participant_count / presale.target_participants) * 100),
        // Token info (if launched)
        token_mint: presale.token_mint,
        launch_signature: presale.launch_signature,
      },
      participants: participants.map(p => ({
        wallet: p.wallet,
        amount_sol: p.amount_sol,
        joined_at: p.joined_at,
        // Hide full wallet, show truncated
        wallet_short: `${p.wallet.slice(0, 4)}...${p.wallet.slice(-4)}`,
      })),
      escrow_wallet: ESCROW_WALLET,
      can_join: presale.status === 'active' && !isExpired && presale.participant_count < presale.target_participants,
      can_refund: presale.status === 'failed' || presale.status === 'refunding',
      is_full: presale.participant_count >= presale.target_participants,
    });
    
  } catch (e: any) {
    console.error('[Presale] Get error:', e.message);
    return NextResponse.json({
      success: false,
      error: e.message || 'Failed to get presale',
    }, { status: 500 });
  }
}

// POST - Check if wallet already joined
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { wallet, action } = await req.json();
    
    if (action === 'check_participation') {
      const participant = await getParticipantByWallet(id, wallet);
      return NextResponse.json({
        success: true,
        has_joined: !!participant && participant.confirmed,
        participant: participant ? {
          amount_sol: participant.amount_sol,
          joined_at: participant.joined_at,
          confirmed: participant.confirmed,
          refunded: participant.refunded,
        } : null,
      });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Invalid action',
    }, { status: 400 });
    
  } catch (e: any) {
    console.error('[Presale] POST error:', e.message);
    return NextResponse.json({
      success: false,
      error: e.message || 'Failed to process request',
    }, { status: 500 });
  }
}
