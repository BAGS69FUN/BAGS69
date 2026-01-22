'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

interface ClaimablePosition {
  baseMint: string;
  quoteMint?: string;
  virtualPool?: string;
  totalClaimableLamportsUserShare?: number;
  isCustomFeeVault?: boolean;
  isMigrated?: boolean;
  userBps?: number;
  programId?: string;
  user?: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenIcon?: string;
}

export default function ClaimFeesPage() {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();
  
  const [positions, setPositions] = useState<ClaimablePosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimedMints, setClaimedMints] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const LAMPORTS_PER_SOL = 1_000_000_000;

  const fetchTokenInfo = async (mint: string) => {
    try {
      const res = await fetch(`https://datapi.jup.ag/v1/assets/search?query=${mint}`);
      const data = await res.json();
      if (data && data.length > 0) {
        return {
          tokenName: data[0].name,
          tokenSymbol: data[0].symbol,
          tokenIcon: data[0].icon,
        };
      }
    } catch (e) {
      console.error('Failed to fetch token info:', e);
    }
    return {};
  };

  const fetchPositions = useCallback(async () => {
    if (!publicKey) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/claim?wallet=${publicKey.toBase58()}`);
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch positions');
      }
      
      const enrichedPositions = await Promise.all(
        (data.positions || []).map(async (pos: ClaimablePosition) => {
          const tokenInfo = await fetchTokenInfo(pos.baseMint);
          return { ...pos, ...tokenInfo };
        })
      );
      
      setPositions(enrichedPositions);
      // Clear claimed status for positions that have new fees
      setClaimedMints(new Set());
    } catch (e: any) {
      console.error('[Claim] Error:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchPositions();
    } else {
      setPositions([]);
      setClaimedMints(new Set());
    }
  }, [connected, publicKey, fetchPositions]);

  const getClaimableAmount = (pos: ClaimablePosition): number => {
    return pos.totalClaimableLamportsUserShare || 0;
  };

  const handleClaim = async (position: ClaimablePosition) => {
    if (!publicKey || !signTransaction) {
      setError('Please connect your wallet');
      return;
    }
    
    setClaiming(position.baseMint);
    setError(null);
    setSuccess(null);
    
    try {
      // Step 1: Get claim transactions from BAGS API
      console.log('[Claim] Creating claim tx...');
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          position,
        }),
      });
      
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate claim transaction');
      }
      
      if (!data.transactions || data.transactions.length === 0) {
        throw new Error('No claim transactions available');
      }
      
      console.log('[Claim] Got', data.transactions.length, 'transactions');
      
      // Process each transaction
      for (let i = 0; i < data.transactions.length; i++) {
        const txData = data.transactions[i];
        const txBase58 = txData.tx || txData;
        
        console.log(`[Claim] Processing tx ${i + 1}...`);
        
        // Step 2: Decode the base58 transaction
        const txBuffer = bs58.decode(txBase58);
        const tx = VersionedTransaction.deserialize(txBuffer);
        
        // Step 3: Sign transaction with wallet
        console.log('[Claim] Signing transaction...');
        const signedTx = await signTransaction(tx);
        
        // Step 4: Get signature from signed transaction
        const signature = bs58.encode(signedTx.signatures[0]);
        console.log('[Claim] Got signature:', signature.slice(0, 20) + '...');
        
        // Step 5: Submit signature to BAGS API
        console.log('[Claim] Submitting to BAGS...');
        const submitRes = await fetch('/api/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature }),
        });
        
        const submitData = await submitRes.json();
        
        if (!submitData.success) {
          throw new Error(submitData.error || 'Failed to submit claim');
        }
        
        console.log('[Claim] Submitted successfully:', submitData.message);
      }
      
      const claimAmount = getClaimableAmount(position) / LAMPORTS_PER_SOL;
      setSuccess(`✅ Claimed ${claimAmount.toFixed(6)} SOL from ${position.tokenSymbol || position.baseMint.slice(0, 6)}!`);
      
      // Mark this position as claimed
      setClaimedMints(prev => new Set([...prev, position.baseMint]));
      
      // Refresh positions after delay to check for any remaining fees
      setTimeout(() => fetchPositions(), 5000);
      
    } catch (e: any) {
      console.error('[Claim] Error:', e);
      setError(e.message || 'Failed to claim fees');
    } finally {
      setClaiming(null);
    }
  };

  // Filter out claimed positions
  const visiblePositions = positions.filter(pos => !claimedMints.has(pos.baseMint));
  const totalClaimable = visiblePositions.reduce((sum, pos) => sum + getClaimableAmount(pos), 0);

  return (
    <div className="wrap">
      <header className="nav">
        <a href="/" className="brand">
          <img src="/bags.gif" alt="BAGS69" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <span style={{ fontWeight: 800, fontSize: 15 }}>BAGS69 <span style={{ color: '#00ff88' }}>$69</span></span>
        </a>
        <div className="nav-right">
          <a className="toggle" href="/">Home</a>
          <a className="toggle" href="/presales">Presales</a>
          <a className="toggle" href="/launched">Launched</a>
          <a className="toggle active" href="/claim">Claim Fees</a>
          <a className="toggle" href="/docs.html">Docs</a>
          <a className="toggle cta" href="/presale/create">Create</a>
          <WalletMultiButton className="wallet-btn" />
        </div>
      </header>

      <main className="content">
        <h1 className="page-title">💰 Claim Your Fees</h1>
        <p className="page-sub">View and claim trading fees from tokens you participated in</p>

        {!connected ? (
          <div className="connect-prompt">
            <div className="prompt-icon">🔗</div>
            <h2>Connect Your Wallet</h2>
            <p>Connect your wallet to view claimable fees</p>
            <WalletMultiButton className="wallet-btn-large" />
          </div>
        ) : loading ? (
          <div className="loading">
            <div className="loader"></div>
            <p>Loading positions...</p>
          </div>
        ) : (
          <>
            {/* Summary Card */}
            <div className="summary-card">
              <div className="summary-item">
                <span className="summary-label">Total Claimable</span>
                <span className="summary-value green">{(totalClaimable / LAMPORTS_PER_SOL).toFixed(6)} SOL</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Positions</span>
                <span className="summary-value">{visiblePositions.length}</span>
              </div>
            </div>

            {/* Messages */}
            {error && <div className="message error">❌ {error}</div>}
            {success && <div className="message success">{success}</div>}

            {/* Positions List */}
            {visiblePositions.length === 0 ? (
              <div className="empty">
                <span style={{ fontSize: 48 }}>📭</span>
                <p>{claimedMints.size > 0 ? 'All fees claimed!' : 'No claimable fees found'}</p>
                <p className="sub">Participate in presales to earn trading fees</p>
                <a href="/presales" className="btn-cta">Browse Presales</a>
              </div>
            ) : (
              <div className="positions">
                {visiblePositions.map(pos => {
                  const claimable = getClaimableAmount(pos) / LAMPORTS_PER_SOL;
                  const isClaiming = claiming === pos.baseMint;
                  
                  return (
                    <div key={pos.baseMint} className="position-card">
                      <div className="position-header">
                        <img 
                          src={pos.tokenIcon || '/bags.gif'} 
                          alt={pos.tokenName || 'Token'} 
                          className="token-icon"
                          onError={(e) => { (e.target as HTMLImageElement).src = '/bags.gif'; }}
                        />
                        <div className="token-info">
                          <span className="token-name">{pos.tokenName || 'Unknown'}</span>
                          <span className="token-symbol">${pos.tokenSymbol || pos.baseMint.slice(0, 6)}</span>
                        </div>
                        <div className="claimable-amount">
                          <span className="amount">{claimable.toFixed(6)} SOL</span>
                          <span className="share">{((pos.userBps || 0) / 100).toFixed(2)}% share</span>
                        </div>
                      </div>

                      <div className="position-details">
                        <div className="detail">
                          <span className="label">Status</span>
                          <span className="value">{pos.isMigrated ? '🎓 Graduated' : '⏳ Pre-migration'}</span>
                        </div>
                      </div>

                      <div className="position-actions">
                        <button 
                          className="btn-claim"
                          onClick={() => handleClaim(pos)}
                          disabled={isClaiming || claimable === 0}
                        >
                          {isClaiming ? '⏳ Claiming...' : '💰 Claim Fees'}
                        </button>
                        <a 
                          href={`https://bags.fm/${pos.baseMint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-view"
                        >
                          View →
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      <style jsx>{`
        .wrap { min-height: 100vh; background: linear-gradient(180deg, #0a0a0a 0%, #0d1117 100%); }
        .nav { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(10,10,10,0.95); backdrop-filter: blur(20px); position: sticky; top: 0; z-index: 100; }
        .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: #fff; }
        .nav-right { display: flex; align-items: center; gap: 6px; }
        .toggle { padding: 8px 14px; border-radius: 8px; text-decoration: none; color: #666; font-size: 13px; font-weight: 500; transition: all 0.2s; }
        .toggle:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .toggle.active { color: #00ff88; background: rgba(0,255,136,0.1); }
        .toggle.cta { background: #00ff88; color: #000; font-weight: 600; }
        
        .content { max-width: 800px; margin: 0 auto; padding: 40px 24px; }
        .page-title { font-size: 28px; font-weight: 800; margin-bottom: 8px; text-align: center; }
        .page-sub { color: #666; text-align: center; margin-bottom: 32px; font-size: 14px; }
        
        .connect-prompt { text-align: center; padding: 60px 20px; background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px solid rgba(255,255,255,0.06); }
        .prompt-icon { font-size: 48px; margin-bottom: 16px; }
        .connect-prompt h2 { font-size: 20px; margin-bottom: 8px; }
        .connect-prompt p { color: #666; margin-bottom: 20px; }
        
        .loading { text-align: center; padding: 60px 20px; }
        .loader { width: 40px; height: 40px; border: 3px solid rgba(0,255,136,0.1); border-top-color: #00ff88; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .summary-card { display: flex; justify-content: center; gap: 48px; padding: 24px; background: rgba(0,255,136,0.05); border: 1px solid rgba(0,255,136,0.2); border-radius: 16px; margin-bottom: 24px; }
        .summary-item { text-align: center; }
        .summary-label { display: block; font-size: 12px; color: #666; margin-bottom: 4px; }
        .summary-value { font-size: 28px; font-weight: 800; color: #fff; }
        .summary-value.green { color: #00ff88; }
        
        .message { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
        .message.error { background: rgba(255,100,100,0.1); border: 1px solid rgba(255,100,100,0.3); color: #ff6b6b; }
        .message.success { background: rgba(0,255,136,0.1); border: 1px solid rgba(0,255,136,0.3); color: #00ff88; }
        
        .empty { text-align: center; padding: 60px 20px; }
        .empty p { color: #888; margin-bottom: 8px; }
        .empty .sub { color: #555; font-size: 13px; }
        .btn-cta { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #00ff88; color: #000; border-radius: 10px; font-weight: 700; text-decoration: none; }
        
        .positions { display: flex; flex-direction: column; gap: 16px; }
        .position-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 20px; transition: all 0.2s; }
        .position-card:hover { border-color: rgba(0,255,136,0.3); }
        
        .position-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
        .token-icon { width: 48px; height: 48px; border-radius: 12px; object-fit: cover; border: 2px solid rgba(255,255,255,0.1); }
        .token-info { flex: 1; }
        .token-name { display: block; font-size: 16px; font-weight: 700; }
        .token-symbol { font-size: 12px; color: #00ff88; }
        .claimable-amount { text-align: right; }
        .amount { display: block; font-size: 18px; font-weight: 700; color: #00ff88; }
        .share { font-size: 11px; color: #666; }
        
        .position-details { display: flex; gap: 24px; padding: 12px 0; border-top: 1px solid rgba(255,255,255,0.05); margin-bottom: 16px; }
        .detail .label { font-size: 10px; color: #555; display: block; margin-bottom: 2px; }
        .detail .value { font-size: 12px; color: #888; }
        
        .position-actions { display: flex; gap: 12px; }
        .btn-claim { flex: 1; padding: 12px; background: linear-gradient(135deg, #00ff88, #00cc6a); color: #000; border: none; border-radius: 10px; font-weight: 700; font-size: 14px; cursor: pointer; transition: all 0.2s; }
        .btn-claim:hover:not(:disabled) { transform: scale(1.02); }
        .btn-claim:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-view { padding: 12px 20px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #fff; text-decoration: none; font-size: 14px; font-weight: 500; transition: all 0.2s; }
        .btn-view:hover { border-color: #00ff88; color: #00ff88; }
      `}</style>
      <style jsx global>{`
        .wallet-btn, .wallet-btn-large { background: rgba(0,255,136,0.1) !important; border: 1px solid rgba(0,255,136,0.3) !important; border-radius: 8px !important; color: #00ff88 !important; font-weight: 600 !important; }
      `}</style>
    </div>
  );
}
