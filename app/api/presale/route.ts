// app/api/presale/route.ts
// List presales and finalize launch after creator signature

import { NextResponse } from 'next/server';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { 
  getAllPresales, 
  getActivePresales,
  getPresaleStats,
  checkExpiredPresales,
  getPresaleById,
  updatePresaleStatus,
  forceSavePresaleDb,
} from '@/lib/presale-db';
import { insertToken } from '@/lib/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// GET - List presales
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') || 'all'; // all, active, launched, failed
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    // Check expired presales
    await checkExpiredPresales();
    
    let presales;
    
    if (filter === 'active') {
      presales = await getActivePresales();
    } else {
      presales = await getAllPresales(limit, offset);
      
      if (filter !== 'all') {
        presales = presales.filter(p => p.status === filter);
      }
    }
    
    const stats = await getPresaleStats();
    
    return NextResponse.json({
      success: true,
      presales: presales.map(p => ({
        id: p.id,
        token_name: p.token_name,
        token_symbol: p.token_symbol,
        image_url: p.image_url,
        status: p.status,
        participant_count: p.participant_count,
        target_participants: p.target_participants,
        total_sol: p.total_sol,
        progress_percent: Math.round((p.participant_count / p.target_participants) * 100),
        expires_at: p.expires_at,
        created_at: p.created_at,
        token_mint: p.token_mint,
        creator_wallet: p.creator_wallet,
      })),
      stats,
      pagination: {
        limit,
        offset,
        total: stats.total,
      },
    });
    
  } catch (e: any) {
    console.error('[Presale] List error:', e.message);
    return NextResponse.json({
      success: false,
      error: e.message || 'Failed to list presales',
    }, { status: 500 });
  }
}

// POST - Finalize launch (after creator signs)
export async function POST(req: Request) {
  try {
    const { presale_id, signature, action } = await req.json();
    
    if (action !== 'finalize_launch') {
      return NextResponse.json({
        success: false,
        error: 'Invalid action',
      }, { status: 400 });
    }
    
    if (!presale_id || !signature) {
      return NextResponse.json({
        success: false,
        error: 'Missing presale_id or signature',
      }, { status: 400 });
    }
    
    // Get presale
    const presale = await getPresaleById(presale_id);
    
    if (!presale) {
      return NextResponse.json({
        success: false,
        error: 'Presale not found',
      }, { status: 404 });
    }
    
    if (presale.status === 'launched') {
      return NextResponse.json({
        success: false,
        error: 'Already launched',
        token_mint: presale.token_mint,
      }, { status: 400 });
    }
    
    // Verify transaction on chain
    console.log('[Presale] Verifying launch transaction:', signature);
    
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    
    try {
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        return NextResponse.json({
          success: false,
          error: 'Launch transaction failed on-chain',
        }, { status: 400 });
      }
      
      console.log('[Presale] Launch transaction confirmed!');
      
    } catch (txError: any) {
      console.error('[Presale] Transaction verification error:', txError.message);
      // Continue anyway - the signature might still be valid
    }
    
    // Update presale status to launched
    await updatePresaleStatus(presale_id, 'launched', {
      launch_signature: signature,
      launched_at: new Date().toISOString(),
    });
    forceSavePresaleDb();
    
    // Register token in our feed
    try {
      await insertToken({
        token_mint: presale.token_mint!,
        token_name: presale.token_name,
        token_symbol: presale.token_symbol,
        image_url: presale.image_url,
        description: presale.description,
        twitter: presale.twitter,
        website: presale.website,
        launch_wallet: presale.creator_wallet,
        launch_signature: signature,
      });
      console.log('[Presale] Token registered in feed');
    } catch (e) {
      console.log('[Presale] Failed to register in feed:', e);
    }
    
    console.log('[Presale] Launch finalized:', presale_id);
    
    return NextResponse.json({
      success: true,
      message: 'Token launched successfully!',
      presale: {
        id: presale.id,
        status: 'launched',
        token_mint: presale.token_mint,
        launch_signature: signature,
      },
      urls: {
        token: `/token/${presale.token_mint}`,
        bags: `https://bags.fm/${presale.token_mint}`,
        solscan: `https://solscan.io/tx/${signature}`,
      },
    });
    
  } catch (e: any) {
    console.error('[Presale] Finalize error:', e.message);
    return NextResponse.json({
      success: false,
      error: e.message || 'Failed to finalize launch',
    }, { status: 500 });
  }
}
