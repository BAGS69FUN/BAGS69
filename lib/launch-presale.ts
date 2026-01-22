// lib/launch-presale.ts
// Core launch logic that can be called from both join and launch routes

import { Connection, Keypair, VersionedTransaction, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { 
  getPresaleById, 
  getPresaleParticipants,
  calculateFeeShares,
  updatePresaleStatus,
  forceSavePresaleDb,
} from './presale-db';
import { 
  PARTNER_WALLET, 
  PARTNER_CONFIG_KEY,
} from './constants';

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';
const BAGS_API_KEY = process.env.BAGS_API_KEY;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const LAUNCHER_PRIVATE_KEY = process.env.LAUNCHER_PRIVATE_KEY;

// Helper to deserialize transaction (handles both legacy and versioned)
// IMPORTANT: BAGS API returns base58 encoded transactions, not base64!
function deserializeTransaction(encodedData: string): VersionedTransaction | Transaction {
  // BAGS API uses base58 encoding
  const buffer = bs58.decode(encodedData);
  
  // Try versioned first, fall back to legacy
  try {
    return VersionedTransaction.deserialize(buffer);
  } catch (e) {
    return Transaction.from(buffer);
  }
}

// Helper to sign and send transaction
async function signAndSendTransaction(
  connection: Connection,
  txData: string,
  signer: Keypair
): Promise<string> {
  const tx = deserializeTransaction(txData);
  
  if (tx instanceof VersionedTransaction) {
    tx.sign([signer]);
  } else {
    tx.partialSign(signer);
  }
  
  const rawTx = tx.serialize();
  const signature = await connection.sendRawTransaction(rawTx, {
    skipPreflight: true,
    preflightCommitment: 'confirmed',
  });
  
  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
}

function parseBagsResponse(data: any): { success: boolean; data?: any; error?: string } {
  if (data.success === true) {
    return { success: true, data: data.response || data };
  } else if (data.success === false) {
    return { success: false, error: data.error || data.response || 'Unknown error' };
  }
  return { success: true, data };
}

export interface LaunchResult {
  success: boolean;
  error?: string;
  token_mint?: string;
  launch_signature?: string;
  meteora_config_key?: string;
  bags_url?: string;
  explorer_url?: string;
  step?: string;
}

export async function launchPresaleToken(presaleId: string, force: boolean = false): Promise<LaunchResult> {
  try {
    // Validate configuration
    if (!BAGS_API_KEY) {
      return { success: false, error: 'BAGS_API_KEY not configured' };
    }
    
    if (!LAUNCHER_PRIVATE_KEY) {
      return { success: false, error: 'LAUNCHER_PRIVATE_KEY not configured' };
    }
    
    // Get presale
    const presale = await getPresaleById(presaleId);
    
    if (!presale) {
      return { success: false, error: 'Presale not found' };
    }
    
    // Check if already launched
    if (presale.status === 'launched') {
      return { 
        success: false, 
        error: 'Presale already launched',
        token_mint: presale.token_mint,
        launch_signature: presale.launch_signature,
      };
    }
    
    // Check if presale is full (unless force)
    if (!force && presale.participant_count < presale.target_participants) {
      return {
        success: false,
        error: `Presale not full. ${presale.participant_count}/${presale.target_participants} participants.`,
      };
    }
    
    // Get participants
    const participants = await getPresaleParticipants(presaleId);
    
    if (participants.length === 0) {
      return { success: false, error: 'No confirmed participants' };
    }
    
    console.log('[LaunchPresale] Starting automatic launch for:', presaleId);
    console.log('[LaunchPresale] Participants:', participants.length);
    console.log('[LaunchPresale] Total SOL:', presale.total_sol);
    
    // Calculate fee shares
    const feeShares = await calculateFeeShares(presaleId);
    console.log('[LaunchPresale] Fee shares calculated:', feeShares.length, 'wallets');
    
    // Verify total is 10000 BPS
    const totalBps = feeShares.reduce((sum, f) => sum + f.bps, 0);
    if (totalBps !== 10000) {
      return { success: false, error: `Fee share calculation error: total is ${totalBps}, expected 10000` };
    }
    
    // Initialize connection and launcher wallet
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const launcherKeypair = Keypair.fromSecretKey(bs58.decode(LAUNCHER_PRIVATE_KEY));
    
    console.log('[LaunchPresale] Launcher wallet:', launcherKeypair.publicKey.toBase58());
    
    // ============================================
    // STEP 1: Create token metadata
    // ============================================
    console.log('[LaunchPresale] Step 1: Creating token metadata...');
    
    const createTokenBody = {
      name: presale.token_name,
      symbol: presale.token_symbol,
      description: presale.description,
      imageUrl: presale.image_url,
      ...(presale.twitter && { twitter: presale.twitter }),
      ...(presale.website && { website: presale.website }),
    };
    
    const metadataRes = await fetch(`${BAGS_API_BASE}/token-launch/create-token-info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BAGS_API_KEY,
      },
      body: JSON.stringify(createTokenBody),
    });
    
    const metadataRaw = await metadataRes.json();
    const metadataResult = parseBagsResponse(metadataRaw);
    
    if (!metadataResult.success || !metadataResult.data?.tokenMint) {
      console.error('[LaunchPresale] Metadata creation failed:', metadataResult.error);
      return { success: false, error: `Failed to create token metadata: ${metadataResult.error}`, step: 'metadata' };
    }
    
    const tokenMint = metadataResult.data.tokenMint;
    const tokenMetadata = metadataResult.data.tokenMetadata;
    
    console.log('[LaunchPresale] Token mint:', tokenMint);
    
    // ============================================
    // STEP 2: Create fee share config
    // ============================================
    console.log('[LaunchPresale] Step 2: Creating fee share config...');
    
    const claimersArray = feeShares.map(f => f.wallet);
    const basisPointsArray = feeShares.map(f => f.bps);
    
    console.log('[LaunchPresale] Total claimers:', claimersArray.length);
    
    const feeShareBody = {
      basisPointsArray,
      payer: launcherKeypair.publicKey.toBase58(),
      baseMint: tokenMint,
      claimersArray,
      partner: PARTNER_WALLET,
      partnerConfig: PARTNER_CONFIG_KEY,
    };
    
    const configRes = await fetch(`${BAGS_API_BASE}/fee-share/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BAGS_API_KEY,
      },
      body: JSON.stringify(feeShareBody),
    });
    
    const configRaw = await configRes.json();
    let configResult = parseBagsResponse(configRaw);
    
    if (!configResult.success || !configResult.data?.meteoraConfigKey) {
      console.log('[LaunchPresale] Trying without partner config...');
      
      const feeShareBodyBasic = {
        basisPointsArray,
        payer: launcherKeypair.publicKey.toBase58(),
        baseMint: tokenMint,
        claimersArray,
      };
      
      const configRes2 = await fetch(`${BAGS_API_BASE}/fee-share/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': BAGS_API_KEY,
        },
        body: JSON.stringify(feeShareBodyBasic),
      });
      
      const configRaw2 = await configRes2.json();
      configResult = parseBagsResponse(configRaw2);
      
      if (!configResult.success || !configResult.data?.meteoraConfigKey) {
        return { 
          success: false, 
          error: `Failed to create fee share config: ${configResult.error}`, 
          step: 'fee_share',
          token_mint: tokenMint,
        };
      }
    }
    
    const meteoraConfigKey = configResult.data.meteoraConfigKey;
    const configTransactions = configResult.data.transactions || [];
    
    console.log('[LaunchPresale] Meteora config key:', meteoraConfigKey);
    console.log('[LaunchPresale] Config response keys:', Object.keys(configResult.data));
    console.log('[LaunchPresale] Transactions array length:', configTransactions.length);
    if (configTransactions.length > 0) {
      console.log('[LaunchPresale] First tx type:', typeof configTransactions[0]);
      if (typeof configTransactions[0] === 'object') {
        console.log('[LaunchPresale] First tx keys:', Object.keys(configTransactions[0]));
      }
    }
    
    // Sign config transactions - MUST succeed before launch
    if (configTransactions.length > 0) {
      console.log('[LaunchPresale] Signing', configTransactions.length, 'config transactions...');
      
      let configTxSuccess = 0;
      for (let i = 0; i < configTransactions.length; i++) {
        const txData = configTransactions[i];
        try {
          // Handle different transaction formats from BAGS API (uses base58!)
          let txBase58: string;
          if (typeof txData === 'string') {
            txBase58 = txData;
          } else if (txData.transaction) {
            txBase58 = txData.transaction;
          } else if (txData.serializedTransaction) {
            txBase58 = txData.serializedTransaction;
          } else if (txData.tx) {
            txBase58 = txData.tx;
          } else {
            console.log('[LaunchPresale] Config tx', i + 1, 'unknown format:', typeof txData, JSON.stringify(txData).slice(0, 200));
            continue;
          }
          
          console.log('[LaunchPresale] Config tx', i + 1, 'base58 length:', txBase58.length);
          
          // Use helper that handles bs58 decoding
          const signature = await signAndSendTransaction(connection, txBase58, launcherKeypair);
          console.log('[LaunchPresale] Config tx', i + 1, 'confirmed:', signature);
          configTxSuccess++;
        } catch (txError: any) {
          console.error('[LaunchPresale] Config tx', i + 1, 'failed:', txError.message);
          // Log more details
          if (txError.logs) {
            console.error('[LaunchPresale] Tx logs:', txError.logs.slice(0, 5));
          }
        }
      }
      
      // If no config tx succeeded, the config might not be initialized
      if (configTxSuccess === 0 && configTransactions.length > 0) {
        console.warn('[LaunchPresale] Warning: No config transactions succeeded, launch may fail');
      }
    }
    
    // ============================================
    // STEP 3: Create and send launch transaction
    // ============================================
    console.log('[LaunchPresale] Step 3: Creating launch transaction...');
    
    const initialBuyLamports = Math.floor(presale.total_sol * 0.5 * LAMPORTS_PER_SOL);
    
    const launchTxBody = {
      ipfs: tokenMetadata,
      tokenMint: tokenMint,
      wallet: launcherKeypair.publicKey.toBase58(),
      initialBuyLamports,
      configKey: meteoraConfigKey,
    };
    
    const launchTxRes = await fetch(`${BAGS_API_BASE}/token-launch/create-launch-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BAGS_API_KEY,
      },
      body: JSON.stringify(launchTxBody),
    });
    
    const launchTxRaw = await launchTxRes.json();
    const launchTxResult = parseBagsResponse(launchTxRaw);
    
    console.log('[LaunchPresale] Launch tx response keys:', Object.keys(launchTxResult.data || {}));
    
    if (!launchTxResult.success) {
      console.error('[LaunchPresale] Launch tx creation failed:', launchTxResult.error);
      await updatePresaleStatus(presaleId, 'active', {
        token_mint: tokenMint,
        meteora_config_key: meteoraConfigKey,
      });
      
      return {
        success: false,
        error: `Failed to create launch transaction: ${launchTxResult.error}`,
        step: 'launch_tx',
        token_mint: tokenMint,
        meteora_config_key: meteoraConfigKey,
      };
    }
    
    // Sign and send launch transaction
    console.log('[LaunchPresale] Signing launch transaction...');
    
    let launchSignature: string;
    try {
      const launchTxData = launchTxResult.data;
      
      // Get transaction from response (BAGS API uses base58 encoding!)
      let txBase58: string;
      if (typeof launchTxData === 'string') {
        txBase58 = launchTxData;
      } else if (launchTxData.transaction) {
        txBase58 = launchTxData.transaction;
      } else if (launchTxData.serializedTransaction) {
        txBase58 = launchTxData.serializedTransaction;
      } else if (launchTxData.tx) {
        txBase58 = launchTxData.tx;
      } else {
        throw new Error(`Unknown launch tx format: ${Object.keys(launchTxData)}`);
      }
      
      console.log('[LaunchPresale] Launch tx base58 length:', txBase58.length);
      
      // Use helper that handles bs58 decoding
      launchSignature = await signAndSendTransaction(connection, txBase58, launcherKeypair);
      console.log('[LaunchPresale] Launch confirmed:', launchSignature);
      
    } catch (txError: any) {
      console.error('[LaunchPresale] Launch tx send failed:', txError.message);
      if (txError.logs) {
        console.error('[LaunchPresale] Launch tx logs:', txError.logs.slice(0, 5));
      }
      
      await updatePresaleStatus(presaleId, 'active', {
        token_mint: tokenMint,
        meteora_config_key: meteoraConfigKey,
      });
      
      return {
        success: false,
        error: `Launch transaction failed: ${txError.message}`,
        step: 'launch_send',
        token_mint: tokenMint,
        meteora_config_key: meteoraConfigKey,
      };
    }
    
    // ============================================
    // STEP 4: Update presale status
    // ============================================
    await updatePresaleStatus(presaleId, 'launched', {
      token_mint: tokenMint,
      meteora_config_key: meteoraConfigKey,
      launch_signature: launchSignature,
      launched_at: new Date().toISOString(),
    });
    forceSavePresaleDb();
    
    console.log('[LaunchPresale] ✅ LAUNCH COMPLETE!');
    console.log('[LaunchPresale] Token:', tokenMint);
    console.log('[LaunchPresale] Signature:', launchSignature);
    
    return {
      success: true,
      token_mint: tokenMint,
      launch_signature: launchSignature,
      meteora_config_key: meteoraConfigKey,
      bags_url: `https://bags.fm/token/${tokenMint}`,
      explorer_url: `https://solscan.io/tx/${launchSignature}`,
    };
    
  } catch (e: any) {
    console.error('[LaunchPresale] Error:', e.message);
    return { success: false, error: e.message };
  }
}
