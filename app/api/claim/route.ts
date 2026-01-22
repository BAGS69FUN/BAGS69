// app/api/claim/route.ts
// Get claimable positions and generate claim transactions using BAGS API

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BAGS_API_BASE = 'https://api2.bags.fm/api/v1';
const BAGS_BEARER_TOKEN = process.env.BAGS_BEARER_TOKEN;

// GET - Get all claimable positions for a wallet
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');
    
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Wallet address required' }, { status: 400 });
    }
    
    if (!BAGS_BEARER_TOKEN) {
      return NextResponse.json({ success: false, error: 'BAGS_BEARER_TOKEN not configured' }, { status: 500 });
    }
    
    console.log('[Claim] Fetching claimable positions for:', wallet);
    
    const res = await fetch(`${BAGS_API_BASE}/token-launch/claimable-positions?wallet=${wallet}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${BAGS_BEARER_TOKEN}`,
        'Accept': 'application/json',
      },
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error('[Claim] API error:', res.status, text.slice(0, 200));
      return NextResponse.json({ success: false, error: `API error: ${res.status}` }, { status: res.status });
    }
    
    const data = await res.json();
    
    let positions = [];
    if (data.success && data.response) {
      positions = Array.isArray(data.response) ? data.response : [];
    }
    
    // Filter out positions with 0 claimable
    positions = positions.filter((p: any) => {
      const total = p.totalClaimableLamportsUserShare || 0;
      return total > 0;
    });
    
    console.log('[Claim] Found', positions.length, 'claimable positions');
    
    return NextResponse.json({ success: true, positions, count: positions.length });
    
  } catch (e: any) {
    console.error('[Claim] Error:', e.message);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// POST - Create claim transaction OR submit signed transaction
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Check if this is a submit-claim-tx request (has signature)
    if (body.signature) {
      return handleSubmitClaimTx(body);
    }
    
    // Otherwise, create claim tx
    return handleCreateClaimTx(body);
    
  } catch (e: any) {
    console.error('[Claim] Error:', e.message);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// Create claim transaction
async function handleCreateClaimTx(body: any) {
  const { wallet, position } = body;
  
  if (!wallet || !position) {
    return NextResponse.json({ success: false, error: 'Wallet and position required' }, { status: 400 });
  }
  
  if (!BAGS_BEARER_TOKEN) {
    return NextResponse.json({ success: false, error: 'BAGS_BEARER_TOKEN not configured' }, { status: 500 });
  }
  
  console.log('[Claim] Creating claim tx for wallet:', wallet);
  console.log('[Claim] Position baseMint:', position.baseMint);
  
  // BAGS API expects EXACTLY these fields:
  const claimBody = {
    feeClaimer: wallet,
    feeShareProgramId: position.programId,
    isCustomFeeVault: position.isCustomFeeVault || false,
    tokenAMint: position.baseMint,
    tokenBMint: position.quoteMint || 'So11111111111111111111111111111111111111112',
    tokenMint: position.baseMint,
  };
  
  console.log('[Claim] Request body:', JSON.stringify(claimBody));
  
  const res = await fetch(`${BAGS_API_BASE}/token-launch/create-claim-txs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BAGS_BEARER_TOKEN}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify(claimBody),
  });
  
  const text = await res.text();
  console.log('[Claim] Response:', text.slice(0, 500));
  
  if (!res.ok) {
    console.error('[Claim] API error:', res.status);
    return NextResponse.json({ success: false, error: text || `API error: ${res.status}` }, { status: res.status });
  }
  
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Invalid JSON response' }, { status: 500 });
  }
  
  if (!data.success) {
    return NextResponse.json({ success: false, error: data.response || data.error || 'Failed to create claim tx' }, { status: 400 });
  }
  
  // Extract transactions - response is array of { tx, blockhash }
  let transactions = [];
  if (Array.isArray(data.response)) {
    transactions = data.response.map((item: any) => ({
      tx: item.tx,
      blockhash: item.blockhash,
    }));
  } else if (data.response?.tx) {
    transactions = [{ tx: data.response.tx, blockhash: data.response.blockhash }];
  }
  
  console.log('[Claim] Got', transactions.length, 'transactions');
  
  return NextResponse.json({
    success: true,
    transactions,
    transactionEncoding: 'base58',
  });
}

// Submit signed claim transaction
async function handleSubmitClaimTx(body: any) {
  const { signature } = body;
  
  if (!signature) {
    return NextResponse.json({ success: false, error: 'Signature required' }, { status: 400 });
  }
  
  if (!BAGS_BEARER_TOKEN) {
    return NextResponse.json({ success: false, error: 'BAGS_BEARER_TOKEN not configured' }, { status: 500 });
  }
  
  console.log('[Claim] Submitting claim tx with signature:', signature.slice(0, 20) + '...');
  
  const res = await fetch(`${BAGS_API_BASE}/token-launch/submit-claim-tx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BAGS_BEARER_TOKEN}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify({ signature }),
  });
  
  const text = await res.text();
  console.log('[Claim] Submit response:', text);
  
  if (!res.ok) {
    return NextResponse.json({ success: false, error: `Submit error: ${res.status}` }, { status: res.status });
  }
  
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Invalid JSON response' }, { status: 500 });
  }
  
  return NextResponse.json({
    success: data.success,
    message: data.response || 'Claim submitted',
  });
}
