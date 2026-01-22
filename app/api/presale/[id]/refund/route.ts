// app/api/presale/[id]/refund/route.ts
// Refund/Withdraw SOL from presale
// - Active presale: Withdraw with 5% tax
// - Failed presale: Full refund (no tax)

import { NextResponse } from 'next/server';
import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { 
  getPresaleById, 
  getParticipantByWallet,
  markParticipantRefunded,
  markParticipantWithdrawn,
  updatePresaleStatus,
} from '@/lib/presale-db';
import { 
  TAX_WALLET, 
  PRESALE_CONFIG, 
  calculateWithdrawalTax 
} from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const ESCROW_PRIVATE_KEY = process.env.ESCROW_PRIVATE_KEY;

// GET - Calculate withdrawal/refund amounts before executing
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const url = new URL(req.url);
    const wallet = url.searchParams.get('wallet');
    
    if (!wallet) {
      return NextResponse.json({
        success: false,
        error: 'Missing wallet address',
      }, { status: 400 });
    }
    
    const presale = await getPresaleById(id);
    
    if (!presale) {
      return NextResponse.json({
        success: false,
        error: 'Presale not found',
      }, { status: 404 });
    }
    
    const participant = await getParticipantByWallet(id, wallet);
    
    if (!participant) {
      return NextResponse.json({
        success: false,
        error: 'Wallet did not participate in this presale',
      }, { status: 404 });
    }
    
    if (!participant.confirmed) {
      return NextResponse.json({
        success: false,
        error: 'Deposit was not confirmed',
      }, { status: 400 });
    }
    
    const isActivePresale = presale.status === 'active' && new Date(presale.expires_at) > new Date();
    const isFailedPresale = presale.status === 'failed' || 
      (presale.status === 'active' && new Date(presale.expires_at) < new Date());
    
    if (!isActivePresale && !isFailedPresale) {
      return NextResponse.json({
        success: false,
        error: `Cannot withdraw from ${presale.status} presale`,
      }, { status: 400 });
    }
    
    // Calculate amounts
    const amountSol = participant.amount_sol;
    let taxAmount = 0;
    let returnAmount = amountSol;
    const txFeeSol = 0.000005; // ~5000 lamports for tx fee
    
    if (isActivePresale) {
      // Withdrawal with 5% tax
      const taxCalc = calculateWithdrawalTax(amountSol);
      taxAmount = taxCalc.taxAmount;
      returnAmount = taxCalc.returnAmount - txFeeSol;
    } else {
      // Full refund (minus tx fee)
      returnAmount = amountSol - txFeeSol;
    }
    
    return NextResponse.json({
      success: true,
      presale_status: presale.status,
      is_active: isActivePresale,
      is_failed: isFailedPresale,
      original_amount: amountSol,
      tax_percent: isActivePresale ? PRESALE_CONFIG.WITHDRAWAL_TAX_BPS / 100 : 0,
      tax_amount: taxAmount,
      return_amount: returnAmount,
      tax_wallet: isActivePresale ? TAX_WALLET : null,
    });
    
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      error: e.message,
    }, { status: 500 });
  }
}

// POST - Execute withdrawal or refund
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { wallet } = await req.json();
    
    if (!wallet) {
      return NextResponse.json({
        success: false,
        error: 'Missing wallet address',
      }, { status: 400 });
    }
    
    // Get presale
    const presale = await getPresaleById(id);
    
    if (!presale) {
      return NextResponse.json({
        success: false,
        error: 'Presale not found',
      }, { status: 404 });
    }
    
    // Determine if this is an active withdrawal or failed refund
    const now = new Date();
    const isActivePresale = presale.status === 'active' && new Date(presale.expires_at) > now;
    const isFailedPresale = presale.status === 'failed' || presale.status === 'refunding' ||
      (presale.status === 'active' && new Date(presale.expires_at) < now);
    
    // Update status if just expired
    if (presale.status === 'active' && new Date(presale.expires_at) < now) {
      await updatePresaleStatus(id, 'failed');
    }
    
    if (!isActivePresale && !isFailedPresale) {
      return NextResponse.json({
        success: false,
        error: `Presale is ${presale.status}. Cannot withdraw/refund.`,
      }, { status: 400 });
    }
    
    // Get participant
    const participant = await getParticipantByWallet(id, wallet);
    
    if (!participant) {
      return NextResponse.json({
        success: false,
        error: 'Wallet did not participate in this presale',
      }, { status: 404 });
    }
    
    if (participant.refunded) {
      return NextResponse.json({
        success: false,
        error: 'Already refunded',
        refund_signature: participant.refund_signature,
      }, { status: 400 });
    }
    
    if (participant.withdrawn) {
      return NextResponse.json({
        success: false,
        error: 'Already withdrawn',
        withdraw_signature: participant.withdraw_signature,
      }, { status: 400 });
    }
    
    if (!participant.confirmed) {
      return NextResponse.json({
        success: false,
        error: 'Deposit was not confirmed',
      }, { status: 400 });
    }
    
    // Check escrow private key
    if (!ESCROW_PRIVATE_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Escrow not configured. Contact support.',
      }, { status: 500 });
    }
    
    const amountSol = participant.amount_sol;
    const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
    
    try {
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const escrowKeypair = Keypair.fromSecretKey(bs58.decode(ESCROW_PRIVATE_KEY));
      const recipientPubkey = new PublicKey(wallet);
      
      // Check escrow balance first
      const escrowBalance = await connection.getBalance(escrowKeypair.publicKey);
      
      if (isActivePresale) {
        // ========================================
        // ACTIVE PRESALE - WITHDRAWAL WITH 5% TAX
        // ========================================
        console.log('[Presale] Processing withdrawal with tax for:', wallet, amountSol, 'SOL');
        
        const { taxAmount, returnAmount } = calculateWithdrawalTax(amountSol);
        const taxLamports = Math.floor(taxAmount * LAMPORTS_PER_SOL);
        const returnLamports = Math.floor(returnAmount * LAMPORTS_PER_SOL) - 10000; // Extra buffer for 2 transfers
        
        if (returnLamports <= 0) {
          return NextResponse.json({
            success: false,
            error: 'Withdrawal amount too small after tax and fees',
          }, { status: 400 });
        }
        
        if (escrowBalance < amountLamports + 10000) {
          console.error('[Presale] Insufficient escrow balance:', escrowBalance / LAMPORTS_PER_SOL, 'SOL');
          return NextResponse.json({
            success: false,
            error: 'Insufficient escrow balance. Contact support.',
          }, { status: 500 });
        }
        
        // Create transaction with 2 transfers: 1 to user, 1 to tax wallet
        const taxPubkey = new PublicKey(TAX_WALLET);
        
        const transaction = new Transaction()
          .add(
            // Send tax to tax wallet
            SystemProgram.transfer({
              fromPubkey: escrowKeypair.publicKey,
              toPubkey: taxPubkey,
              lamports: taxLamports,
            })
          )
          .add(
            // Send remainder to user
            SystemProgram.transfer({
              fromPubkey: escrowKeypair.publicKey,
              toPubkey: recipientPubkey,
              lamports: returnLamports,
            })
          );
        
        // Send transaction
        const signature = await sendAndConfirmTransaction(
          connection,
          transaction,
          [escrowKeypair],
          { commitment: 'confirmed' }
        );
        
        console.log('[Presale] Withdrawal sent:', signature);
        console.log('[Presale] Tax:', taxAmount, 'SOL | Return:', returnLamports / LAMPORTS_PER_SOL, 'SOL');
        
        // Mark as withdrawn
        await markParticipantWithdrawn(id, wallet, signature, taxAmount);
        
        return NextResponse.json({
          success: true,
          type: 'withdrawal',
          message: 'Withdrawal successful!',
          withdrawal: {
            original_amount_sol: amountSol,
            tax_percent: PRESALE_CONFIG.WITHDRAWAL_TAX_BPS / 100,
            tax_amount_sol: taxAmount,
            return_amount_sol: returnLamports / LAMPORTS_PER_SOL,
            signature,
            explorer_url: `https://solscan.io/tx/${signature}`,
          },
        });
        
      } else {
        // ========================================
        // FAILED PRESALE - FULL REFUND (NO TAX)
        // ========================================
        console.log('[Presale] Processing refund for:', wallet, amountSol, 'SOL');
        
        // Calculate refund amount (subtract small fee for transaction)
        const refundLamports = amountLamports - 5000; // 5000 lamports for tx fee
        
        if (refundLamports <= 0) {
          return NextResponse.json({
            success: false,
            error: 'Refund amount too small after fees',
          }, { status: 400 });
        }
        
        if (escrowBalance < refundLamports + 5000) {
          console.error('[Presale] Insufficient escrow balance:', escrowBalance / LAMPORTS_PER_SOL, 'SOL');
          return NextResponse.json({
            success: false,
            error: 'Insufficient escrow balance. Contact support.',
          }, { status: 500 });
        }
        
        // Create transfer transaction
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: escrowKeypair.publicKey,
            toPubkey: recipientPubkey,
            lamports: refundLamports,
          })
        );
        
        // Send transaction
        const signature = await sendAndConfirmTransaction(
          connection,
          transaction,
          [escrowKeypair],
          { commitment: 'confirmed' }
        );
        
        console.log('[Presale] Refund sent:', signature);
        
        // Mark as refunded
        await markParticipantRefunded(id, wallet, signature);
        
        // Update presale status to refunding if not already
        if (presale.status === 'failed') {
          await updatePresaleStatus(id, 'refunding');
        }
        
        return NextResponse.json({
          success: true,
          type: 'refund',
          message: 'Refund sent successfully!',
          refund: {
            amount_sol: refundLamports / LAMPORTS_PER_SOL,
            signature,
            explorer_url: `https://solscan.io/tx/${signature}`,
          },
        });
      }
      
    } catch (txError: any) {
      console.error('[Presale] Transaction error:', txError.message);
      return NextResponse.json({
        success: false,
        error: `Transaction failed: ${txError.message}`,
      }, { status: 500 });
    }
    
  } catch (e: any) {
    console.error('[Presale] Refund/Withdraw error:', e.message);
    return NextResponse.json({
      success: false,
      error: e.message || 'Failed to process request',
    }, { status: 500 });
  }
}
