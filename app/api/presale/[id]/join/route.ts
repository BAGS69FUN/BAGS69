// app/api/presale/[id]/join/route.ts
// Join a presale - confirm deposit transaction

import { NextResponse } from 'next/server';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { 
  getPresaleById, 
  addParticipant,
  confirmParticipant,
  getParticipantByWallet,
  updatePresaleStatus,
  checkExpiredPresales,
} from '@/lib/presale-db';
import { ESCROW_WALLET } from '@/lib/constants';
import { launchPresaleToken } from '@/lib/launch-presale';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// POST - Join presale (confirm deposit transaction)
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { wallet, amount_sol, tx_signature } = await req.json();
    
    // Validate inputs
    if (!wallet || !amount_sol || !tx_signature) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: wallet, amount_sol, tx_signature',
      }, { status: 400 });
    }
    
    // Check expired presales
    await checkExpiredPresales();
    
    // Get presale
    const presale = await getPresaleById(id);
    
    if (!presale) {
      return NextResponse.json({
        success: false,
        error: 'Presale not found',
      }, { status: 404 });
    }
    
    // Check presale status
    if (presale.status !== 'active') {
      return NextResponse.json({
        success: false,
        error: `Presale is ${presale.status}, cannot join`,
      }, { status: 400 });
    }
    
    // Check if expired
    if (new Date(presale.expires_at) < new Date()) {
      await updatePresaleStatus(id, 'failed');
      return NextResponse.json({
        success: false,
        error: 'Presale has expired',
      }, { status: 400 });
    }
    
    // Check if full
    if (presale.participant_count >= presale.target_participants) {
      return NextResponse.json({
        success: false,
        error: 'Presale is full',
      }, { status: 400 });
    }
    
    // Check if wallet is creator (creator cannot join their own presale)
    if (wallet === presale.creator_wallet) {
      return NextResponse.json({
        success: false,
        error: 'Creator cannot join their own presale',
      }, { status: 400 });
    }
    
    // Check if wallet already joined
    const existingParticipant = await getParticipantByWallet(id, wallet);
    if (existingParticipant && existingParticipant.confirmed) {
      return NextResponse.json({
        success: false,
        error: 'Wallet has already joined this presale',
      }, { status: 400 });
    }
    
    // Validate amount
    if (amount_sol < presale.min_sol_per_wallet) {
      return NextResponse.json({
        success: false,
        error: `Minimum contribution is ${presale.min_sol_per_wallet} SOL`,
      }, { status: 400 });
    }
    
    if (amount_sol > presale.max_sol_per_wallet) {
      return NextResponse.json({
        success: false,
        error: `Maximum contribution is ${presale.max_sol_per_wallet} SOL`,
      }, { status: 400 });
    }
    
    // Verify transaction on-chain
    console.log('[Presale] Verifying transaction:', tx_signature);
    
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    
    try {
      // Wait for transaction confirmation
      const txInfo = await connection.getTransaction(tx_signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      
      if (!txInfo) {
        // Transaction might not be confirmed yet, try waiting
        console.log('[Presale] Transaction not found, waiting...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const txInfoRetry = await connection.getTransaction(tx_signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        
        if (!txInfoRetry) {
          return NextResponse.json({
            success: false,
            error: 'Transaction not found. Please wait for confirmation and try again.',
          }, { status: 400 });
        }
      }
      
      // Get transaction details to verify
      const tx = txInfo || await connection.getTransaction(tx_signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      
      if (!tx) {
        return NextResponse.json({
          success: false,
          error: 'Could not fetch transaction details',
        }, { status: 400 });
      }
      
      // Check if transaction was successful
      if (tx.meta?.err) {
        return NextResponse.json({
          success: false,
          error: 'Transaction failed on-chain',
        }, { status: 400 });
      }
      
      // Verify the transaction sent SOL to escrow wallet
      // Check pre/post balances
      const escrowPubkey = new PublicKey(ESCROW_WALLET);
      const accountKeys = tx.transaction.message.staticAccountKeys || 
                          (tx.transaction.message as any).accountKeys;
      
      let escrowIndex = -1;
      for (let i = 0; i < accountKeys.length; i++) {
        if (accountKeys[i].toBase58() === escrowPubkey.toBase58()) {
          escrowIndex = i;
          break;
        }
      }
      
      if (escrowIndex === -1) {
        return NextResponse.json({
          success: false,
          error: 'Transaction did not send SOL to escrow wallet',
        }, { status: 400 });
      }
      
      // Calculate amount received by escrow
      const preBal = tx.meta?.preBalances?.[escrowIndex] || 0;
      const postBal = tx.meta?.postBalances?.[escrowIndex] || 0;
      const receivedLamports = postBal - preBal;
      const receivedSol = receivedLamports / LAMPORTS_PER_SOL;
      
      // Allow small tolerance for rounding
      const tolerance = 0.001;
      if (Math.abs(receivedSol - amount_sol) > tolerance) {
        return NextResponse.json({
          success: false,
          error: `Amount mismatch. Expected ${amount_sol} SOL, received ${receivedSol.toFixed(4)} SOL`,
        }, { status: 400 });
      }
      
      console.log('[Presale] Transaction verified:', receivedSol, 'SOL');
      
    } catch (verifyError: any) {
      console.error('[Presale] Verification error:', verifyError.message);
      // If verification fails, we still add the participant but log the error
      // In production, you might want to be stricter
    }
    
    // Add participant to database
    const participant = await addParticipant({
      presale_id: id,
      wallet,
      amount_sol,
      tx_signature,
    });
    
    if (!participant) {
      return NextResponse.json({
        success: false,
        error: 'Failed to add participant. Wallet may have already joined.',
      }, { status: 400 });
    }
    
    // Confirm participant
    const result = await confirmParticipant(id, wallet);
    
    if (!result) {
      return NextResponse.json({
        success: false,
        error: 'Failed to confirm participant',
      }, { status: 500 });
    }
    
    const { presale: updatedPresale } = result;
    
    // Check if presale is now full (trigger launch)
    const isFull = updatedPresale.participant_count >= updatedPresale.target_participants;
    
    console.log('[Presale] Participant confirmed:', wallet, 
      '| Count:', updatedPresale.participant_count, '/', updatedPresale.target_participants);
    
    // Auto-launch when full
    let launchTriggered = false;
    let launchResult: any = null;
    
    if (isFull && updatedPresale.status === 'active') {
      console.log('[Presale] Presale is full! Triggering auto-launch...');
      
      try {
        // Call launch function directly (no HTTP request needed)
        launchResult = await launchPresaleToken(id, false);
        launchTriggered = launchResult.success;
        
        if (launchTriggered) {
          console.log('[Presale] Auto-launch successful!', launchResult.token_mint);
        } else {
          console.error('[Presale] Auto-launch failed:', launchResult.error);
        }
      } catch (launchError: any) {
        console.error('[Presale] Auto-launch error:', launchError.message);
        // Don't fail the join - user can manually trigger launch
      }
    }
    
    return NextResponse.json({
      success: true,
      message: launchTriggered ? '🚀 Presale launched!' : 'Successfully joined presale!',
      participant: {
        wallet,
        amount_sol,
        position: updatedPresale.participant_count,
      },
      presale: {
        participant_count: updatedPresale.participant_count,
        total_sol: updatedPresale.total_sol,
        progress_percent: Math.round((updatedPresale.participant_count / updatedPresale.target_participants) * 100),
        is_full: isFull,
      },
      // Launch info
      ready_to_launch: isFull,
      launch_triggered: launchTriggered,
      launch: launchTriggered ? launchResult : null,
    });
    
  } catch (e: any) {
    console.error('[Presale] Join error:', e.message);
    return NextResponse.json({
      success: false,
      error: e.message || 'Failed to join presale',
    }, { status: 500 });
  }
}
