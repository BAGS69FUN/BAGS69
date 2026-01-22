// app/api/presale/create/route.ts
// Create a new presale - requires 0.045 SOL launch fee payment first

import { NextResponse } from 'next/server';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createPresale } from '@/lib/presale-db';
import { 
  PRESALE_CONFIG, 
  LAUNCHER_WALLET, 
  isValidDuration 
} from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Verify the launch fee transaction on-chain
async function verifyLaunchFeeTransaction(
  connection: Connection,
  signature: string,
  creatorWallet: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    
    if (!tx) {
      return { valid: false, error: 'Transaction not found' };
    }
    
    if (tx.meta?.err) {
      return { valid: false, error: 'Transaction failed' };
    }
    
    // Check that it's a transfer to launcher wallet
    const launcherPubkey = new PublicKey(LAUNCHER_WALLET);
    const launcherIndex = tx.transaction.message.staticAccountKeys?.findIndex(
      (key) => key.equals(launcherPubkey)
    );
    
    if (launcherIndex === -1 || launcherIndex === undefined) {
      return { valid: false, error: 'Transaction does not include launcher wallet' };
    }
    
    // Check the amount transferred
    const preBalances = tx.meta?.preBalances || [];
    const postBalances = tx.meta?.postBalances || [];
    
    if (launcherIndex < postBalances.length) {
      const received = postBalances[launcherIndex] - preBalances[launcherIndex];
      const expectedLamports = PRESALE_CONFIG.LAUNCH_FEE_SOL * LAMPORTS_PER_SOL;
      
      // Allow some tolerance for fees
      if (received < expectedLamports * 0.99) {
        return { 
          valid: false, 
          error: `Insufficient amount. Expected ${PRESALE_CONFIG.LAUNCH_FEE_SOL} SOL, received ${received / LAMPORTS_PER_SOL} SOL` 
        };
      }
    }
    
    // Verify sender is the creator
    const creatorPubkey = new PublicKey(creatorWallet);
    const creatorIndex = tx.transaction.message.staticAccountKeys?.findIndex(
      (key) => key.equals(creatorPubkey)
    );
    
    if (creatorIndex === -1 || creatorIndex === undefined) {
      return { valid: false, error: 'Transaction not from creator wallet' };
    }
    
    return { valid: true };
  } catch (e: any) {
    console.error('[Presale Create] Error verifying tx:', e.message);
    return { valid: false, error: e.message };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const {
      creator_wallet,
      token_name,
      token_symbol,
      description,
      image_url,
      twitter,
      website,
      min_sol_per_wallet,
      max_sol_per_wallet,
      duration_minutes,
      target_participants, // 1-68
      launch_fee_signature, // Required
    } = body;
    
    // Validate required fields
    if (!creator_wallet || !token_name || !token_symbol || !description || !image_url) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: creator_wallet, token_name, token_symbol, description, image_url',
      }, { status: 400 });
    }
    
    // Validate launch fee signature is provided
    if (!launch_fee_signature) {
      return NextResponse.json({
        success: false,
        error: `Launch fee payment required. Please pay ${PRESALE_CONFIG.LAUNCH_FEE_SOL} SOL to create a presale.`,
        launch_fee_required: PRESALE_CONFIG.LAUNCH_FEE_SOL,
        launcher_wallet: LAUNCHER_WALLET,
      }, { status: 400 });
    }
    
    // Validate duration
    const duration = parseInt(duration_minutes) || 30;
    if (!isValidDuration(duration)) {
      return NextResponse.json({
        success: false,
        error: `Invalid duration. Must be one of: ${PRESALE_CONFIG.DURATION_OPTIONS.join(', ')} minutes`,
        valid_durations: PRESALE_CONFIG.DURATION_OPTIONS,
      }, { status: 400 });
    }
    
    // Validate target participants (1-68)
    const targetParts = parseInt(target_participants) || PRESALE_CONFIG.DEFAULT_PARTICIPANTS;
    if (targetParts < PRESALE_CONFIG.MIN_PARTICIPANTS || targetParts > PRESALE_CONFIG.MAX_PARTICIPANTS) {
      return NextResponse.json({
        success: false,
        error: `Target participants must be between ${PRESALE_CONFIG.MIN_PARTICIPANTS} and ${PRESALE_CONFIG.MAX_PARTICIPANTS}`,
      }, { status: 400 });
    }
    
    // Validate symbol
    if (token_symbol.length > 10) {
      return NextResponse.json({
        success: false,
        error: 'Token symbol must be 10 characters or less',
      }, { status: 400 });
    }
    
    // Verify launch fee transaction on-chain
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const verification = await verifyLaunchFeeTransaction(
      connection,
      launch_fee_signature,
      creator_wallet
    );
    
    if (!verification.valid) {
      return NextResponse.json({
        success: false,
        error: `Launch fee verification failed: ${verification.error}`,
        launch_fee_required: PRESALE_CONFIG.LAUNCH_FEE_SOL,
        launcher_wallet: LAUNCHER_WALLET,
      }, { status: 400 });
    }
    
    // Create presale
    const presale = await createPresale({
      creator_wallet,
      token_name,
      token_symbol,
      description,
      image_url,
      twitter,
      website,
      min_sol_per_wallet: parseFloat(min_sol_per_wallet) || PRESALE_CONFIG.DEFAULT_MIN_SOL,
      max_sol_per_wallet: parseFloat(max_sol_per_wallet) || PRESALE_CONFIG.DEFAULT_MAX_SOL,
      duration_minutes: duration,
      target_participants: targetParts,
      launch_fee_signature,
    });
    
    console.log('[Presale Create] Created presale:', presale.id, 'target:', targetParts);
    
    return NextResponse.json({
      success: true,
      presale,
      config: {
        max_wallets: targetParts + 1, // participants + creator
        target_participants: targetParts,
        creator_allocation_percent: PRESALE_CONFIG.CREATOR_ALLOCATION_BPS / 100,
        withdrawal_tax_percent: PRESALE_CONFIG.WITHDRAWAL_TAX_BPS / 100,
        duration_options: PRESALE_CONFIG.DURATION_OPTIONS,
        launch_fee_sol: PRESALE_CONFIG.LAUNCH_FEE_SOL,
      },
    });
    
  } catch (e: any) {
    console.error('[Presale Create] Error:', e.message);
    return NextResponse.json({
      success: false,
      error: e.message || 'Failed to create presale',
    }, { status: 500 });
  }
}

// GET - Get presale configuration
export async function GET() {
  return NextResponse.json({
    success: true,
    config: {
      max_wallets: PRESALE_CONFIG.MAX_WALLETS,
      min_participants: PRESALE_CONFIG.MIN_PARTICIPANTS,
      max_participants: PRESALE_CONFIG.MAX_PARTICIPANTS,
      default_participants: PRESALE_CONFIG.DEFAULT_PARTICIPANTS,
      creator_allocation_percent: PRESALE_CONFIG.CREATOR_ALLOCATION_BPS / 100,
      withdrawal_tax_percent: PRESALE_CONFIG.WITHDRAWAL_TAX_BPS / 100,
      duration_options: PRESALE_CONFIG.DURATION_OPTIONS,
      launch_fee_sol: PRESALE_CONFIG.LAUNCH_FEE_SOL,
      launcher_wallet: LAUNCHER_WALLET,
    },
  });
}
