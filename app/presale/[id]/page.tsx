'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';

interface Presale {
  id: string;
  creator_wallet: string;
  token_name: string;
  token_symbol: string;
  description: string;
  image_url: string;
  twitter?: string;
  website?: string;
  min_sol: number;
  max_sol: number;
  target_participants: number;
  status: string;
  expires_at: string;
  time_remaining_seconds: number;
  total_sol: number;
  participant_count: number;
  progress_percent: number;
  token_mint?: string;
  launch_signature?: string;
}

interface Participant {
  wallet: string;
  wallet_short: string;
  amount_sol: number;
  joined_at: string;
}

export default function PresaleDetailPage() {
  const router = useRouter();
  const params = useParams();
  const presaleId = params.id as string;
  
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();
  
  const [presale, setPresale] = useState<Presale | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [escrowWallet, setEscrowWallet] = useState<string>('');
  const [canJoin, setCanJoin] = useState(false);
  const [canRefund, setCanRefund] = useState(false);
  const [isFull, setIsFull] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [joinAmount, setJoinAmount] = useState('0.5');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [hasJoined, setHasJoined] = useState(false);
  const [myParticipation, setMyParticipation] = useState<any>(null);

  // Fetch presale data
  const fetchPresale = useCallback(async () => {
    try {
      const res = await fetch(`/api/presale/${presaleId}`);
      const data = await res.json();
      
      if (!data.success) {
        setError(data.error || 'Presale not found');
        setLoading(false);
        return;
      }
      
      setPresale(data.presale);
      setParticipants(data.participants || []);
      setEscrowWallet(data.escrow_wallet);
      setCanJoin(data.can_join);
      setCanRefund(data.can_refund);
      setIsFull(data.is_full);
      setTimeRemaining(data.presale.time_remaining_seconds);
      setLoading(false);
      
      // Check if current wallet has joined
      if (publicKey && data.participants) {
        const myP = data.participants.find((p: Participant) => 
          p.wallet === publicKey.toBase58()
        );
        if (myP) {
          setHasJoined(true);
          setMyParticipation(myP);
        }
      }
      
    } catch (e: any) {
      setError(e.message || 'Failed to load presale');
      setLoading(false);
    }
  }, [presaleId, publicKey]);

  // Initial fetch
  useEffect(() => {
    fetchPresale();
  }, [fetchPresale]);

  // Countdown timer
  useEffect(() => {
    if (timeRemaining <= 0) return;
    
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          fetchPresale(); // Refresh when expired
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [timeRemaining, fetchPresale]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchPresale, 10000);
    return () => clearInterval(interval);
  }, [fetchPresale]);

  // Format time remaining
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle join presale
  const handleJoin = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet');
      return;
    }
    if (!signTransaction) {
      setError('Wallet does not support signing');
      return;
    }
    if (!escrowWallet) {
      setError('Escrow wallet not configured. Please contact support.');
      return;
    }
    
    const amount = parseFloat(joinAmount);
    if (!presale || amount < presale.min_sol || amount > presale.max_sol) {
      setError(`Amount must be between ${presale?.min_sol} and ${presale?.max_sol} SOL`);
      return;
    }
    
    setJoining(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Create transaction to send SOL to escrow
      const escrowPubkey = new PublicKey(escrowWallet);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: escrowPubkey,
          lamports,
        })
      );
      
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Sign transaction
      const signedTx = await signTransaction(transaction);
      
      // Send transaction
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      
      // Wait for confirmation
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      
      console.log('Deposit confirmed:', signature);
      
      // Confirm with backend
      const confirmRes = await fetch(`/api/presale/${presaleId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          amount_sol: amount,
          tx_signature: signature,
        }),
      });
      
      const confirmData = await confirmRes.json();
      
      if (!confirmData.success) {
        throw new Error(confirmData.error || 'Failed to confirm participation');
      }
      
      setSuccess(`🎉 Successfully joined! You're participant #${confirmData.participant.position}`);
      setHasJoined(true);
      setMyParticipation({ amount_sol: amount });
      
      // Refresh presale data
      await fetchPresale();
      
      // Check if auto-launch was triggered
      if (confirmData.launch_triggered && confirmData.launch) {
        setSuccess(`🚀 Token launched! Mint: ${confirmData.launch.token_mint?.slice(0, 8)}...`);
      } else if (confirmData.ready_to_launch) {
        setSuccess('🎉 Presale is full! Launching...');
      } else {
        setSuccess(`✅ Joined! Position: #${confirmData.participant.position}`);
      }
      
    } catch (e: any) {
      console.error('Join error:', e);
      setError(e.message || 'Failed to join presale');
    } finally {
      setJoining(false);
    }
  };

  // Handle refund/withdrawal
  const handleRefund = async () => {
    if (!publicKey) {
      setError('Please connect your wallet');
      return;
    }
    
    setRefunding(true);
    setError(null);
    setSuccess(null);
    
    try {
      const res = await fetch(`/api/presale/${presaleId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
        }),
      });
      
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed');
      }
      
      // Show appropriate success message
      if (data.type === 'withdrawal') {
        setSuccess(`✅ Withdrawn! You received ${data.withdrawal.return_amount_sol.toFixed(4)} SOL (${data.withdrawal.tax_percent}% tax: ${data.withdrawal.tax_amount_sol.toFixed(4)} SOL)`);
      } else {
        setSuccess(`✅ Refunded! ${data.refund.amount_sol.toFixed(4)} SOL sent to your wallet`);
      }
      
      setHasJoined(false);
      setMyParticipation(null);
      await fetchPresale();
      
    } catch (e: any) {
      setError(e.message || 'Request failed');
    } finally {
      setRefunding(false);
    }
  };

  // Handle launch (creator only)
  const handleLaunch = async () => {
    if (!publicKey || !signTransaction) {
      setError('Please connect your wallet');
      return;
    }
    
    setLaunching(true);
    setError(null);
    
    try {
      // Get launch transaction
      const launchRes = await fetch(`/api/presale/${presaleId}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      const launchData = await launchRes.json();
      
      if (!launchData.success && !launchData.partial) {
        throw new Error(launchData.error || 'Launch failed');
      }
      
      if (launchData.launchTransaction) {
        // Sign launch transaction
        const txBuffer = bs58.decode(launchData.launchTransaction);
        const transaction = VersionedTransaction.deserialize(txBuffer);
        
        const signedTx = await signTransaction(transaction);
        
        // Send transaction
        const signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        
        await connection.confirmTransaction(signature, 'confirmed');
        
        // Finalize with backend
        const finalizeRes = await fetch('/api/presale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'finalize_launch',
            presale_id: presaleId,
            signature,
          }),
        });
        
        const finalizeData = await finalizeRes.json();
        
        if (finalizeData.success) {
          setSuccess(`🎉 Token launched successfully!`);
          await fetchPresale();
        } else {
          throw new Error(finalizeData.error);
        }
      } else {
        setSuccess(launchData.message || 'Token created! Further steps needed.');
      }
      
    } catch (e: any) {
      console.error('Launch error:', e);
      setError(e.message || 'Launch failed');
    } finally {
      setLaunching(false);
    }
  };

  if (loading) {
    return (
      <div className="wrap">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div className="spinner" />
        </div>
        <style jsx>{`
          .wrap { min-height: 100vh; background: #050505; }
          .spinner {
            width: 48px; height: 48px;
            border: 3px solid rgba(0, 255, 136, 0.2);
            border-top-color: #00ff88;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!presale) {
    return (
      <div className="wrap">
        <div style={{ textAlign: 'center', padding: 50 }}>
          <h2>Presale Not Found</h2>
          <p style={{ color: 'var(--muted)' }}>{error}</p>
          <a href="/presales" style={{ color: 'var(--accent)' }}>← Back to Presales</a>
        </div>
        <style jsx>{`.wrap { min-height: 100vh; background: #050505; color: white; }`}</style>
      </div>
    );
  }

  const isCreator = publicKey?.toBase58() === presale.creator_wallet;
  const isExpired = timeRemaining <= 0 && presale.status === 'active';
  const isLaunched = presale.status === 'launched';
  const isFailed = presale.status === 'failed' || isExpired;

  return (
    <div className="wrap">
      <div className="stars" />
      
      <header className="nav">
        <div className="brand">
          <img src="/bags.gif" alt="LOB" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <span style={{ fontWeight: 800, fontSize: 15 }}>BAGS69 <span style={{ color: 'var(--accent)' }}>$69</span></span>
        </div>
        <div className="nav-right">
          <a className="toggle" href="/">Home</a>
          <a className="toggle" href="/presales">Presales</a>
          <a className="toggle" href="/launched">Launched</a>
          <a className="toggle" href="/claim">Claim Fees</a>
          <a className="toggle" href="/docs.html">Docs</a>
          <a className="toggle cta" href="/presale/create">Create</a>
          <WalletMultiButton className="wallet-btn" />
        </div>
      </header>

      <main className="content">
        {/* Token Header */}
        <div className="token-header">
          <img 
            src={presale.image_url} 
            alt={presale.token_name}
            className="token-image"
            onError={(e) => { (e.target as HTMLImageElement).src = '/bags.gif'; }}
          />
          <div className="token-info">
            <h1>{presale.token_name} <span className="symbol">${presale.token_symbol}</span></h1>
            <p className="description">{presale.description}</p>
            <div className="links">
              {presale.twitter && <a href={presale.twitter} target="_blank" rel="noopener">𝕏 Twitter</a>}
              {presale.website && <a href={presale.website} target="_blank" rel="noopener">🌐 Website</a>}
              {presale.token_mint && <a href={`https://bags.fm/${presale.token_mint}`} target="_blank" rel="noopener">📊 BAGS.FM</a>}
            </div>
          </div>
          
          {/* Status Badge */}
          <div className={`status-badge ${presale.status}`}>
            {isLaunched ? '🚀 LAUNCHED' : isFailed ? '❌ FAILED' : isFull ? '✅ FULL' : '⏳ ACTIVE'}
          </div>
        </div>

        {/* Countdown / Status */}
        {!isLaunched && !isFailed && (
          <div className="countdown-box">
            <div className="countdown-label">Time Remaining</div>
            <div className="countdown-value">{formatTime(timeRemaining)}</div>
            <div className="countdown-sub">Until presale ends</div>
          </div>
        )}

        {isLaunched && (
          <div className="success-banner">
            🎉 Token Launched Successfully!
            <a href={`https://bags.fm/${presale.token_mint}`} target="_blank" rel="noopener">
              Trade on BAGS.FM →
            </a>
          </div>
        )}

        {isFailed && !isLaunched && (
          <div className="failed-banner">
            ❌ Presale Failed - Refunds Available
          </div>
        )}

        {/* Progress */}
        <div className="progress-section">
          <div className="progress-header">
            <span>Participants</span>
            <span>
              <span style={{ color: 'var(--accent)' }}>{presale.participant_count + 1}</span>
              <span style={{ color: 'var(--muted)' }}> / {presale.target_participants + 1}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>
                ({presale.participant_count} + creator)
              </span>
            </span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${((presale.participant_count + 1) / (presale.target_participants + 1)) * 100}%` }}
            />
          </div>
          <div className="progress-stats">
            <div className="stat">
              <span className="stat-label">Total SOL</span>
              <span className="stat-value">{presale.total_sol.toFixed(2)} SOL</span>
            </div>
            <div className="stat">
              <span className="stat-label">Progress</span>
              <span className="stat-value">{presale.progress_percent}%</span>
            </div>
            <div className="stat">
              <span className="stat-label">Contribution</span>
              <span className="stat-value">{presale.min_sol} - {presale.max_sol} SOL</span>
            </div>
          </div>
        </div>

        {/* Action Section */}
        <div className="action-section">
          {/* Join Form */}
          {canJoin && !hasJoined && connected && !isCreator && (
            <div className="join-form">
              <h3>Join This Presale</h3>
              <p>Contribute SOL to become a fee earner</p>
              
              <div className="amount-input">
                <input
                  type="number"
                  step="0.1"
                  min={presale.min_sol}
                  max={presale.max_sol}
                  value={joinAmount}
                  onChange={e => setJoinAmount(e.target.value)}
                  className="form-input"
                />
                <span className="sol-label">SOL</span>
              </div>
              
              <div className="quick-amounts">
                {[presale.min_sol, (presale.min_sol + presale.max_sol) / 2, presale.max_sol].map(amt => (
                  <button 
                    key={amt} 
                    onClick={() => setJoinAmount(amt.toString())}
                    className={joinAmount === amt.toString() ? 'active' : ''}
                  >
                    {amt} SOL
                  </button>
                ))}
              </div>
              
              <button 
                className="btn primary"
                onClick={handleJoin}
                disabled={joining}
              >
                {joining ? '⏳ Joining...' : `🚀 Join Presale (${joinAmount} SOL)`}
              </button>
            </div>
          )}

          {/* Already Joined */}
          {hasJoined && !isFailed && !isLaunched && (
            <div className="joined-status">
              <h3>✅ You've Joined!</h3>
              <p>Contribution: {myParticipation?.amount_sol} SOL</p>
              <p className="muted">You'll earn fee share proportional to your contribution</p>
              
              {/* Withdraw option for active presale */}
              {presale.status === 'active' && (
                <div className="withdraw-section" style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 11, color: '#ff9900', marginBottom: 8 }}>
                    ⚠️ Early withdrawal: 5% tax ({(myParticipation?.amount_sol * 0.05).toFixed(4)} SOL)
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
                    You'll receive: {(myParticipation?.amount_sol * 0.95).toFixed(4)} SOL
                  </p>
                  <button 
                    className="btn secondary"
                    onClick={handleRefund}
                    disabled={refunding}
                    style={{ background: 'rgba(255, 153, 0, 0.1)', borderColor: 'rgba(255, 153, 0, 0.3)' }}
                  >
                    {refunding ? '⏳ Processing...' : '💸 Withdraw (5% tax)'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Full Refund Button - only for failed presales */}
          {canRefund && hasJoined && isFailed && (
            <div className="refund-section">
              <button 
                className="btn secondary"
                onClick={handleRefund}
                disabled={refunding}
              >
                {refunding ? '⏳ Processing Refund...' : '💸 Request Refund'}
              </button>
            </div>
          )}

          {/* Launch Button (Creator) */}
          {isCreator && isFull && !isLaunched && (
            <div className="launch-section">
              <h3>🎉 Presale is Full!</h3>
              <p>All {presale.target_participants} participants have joined. Launch the token!</p>
              <button 
                className="btn primary large"
                onClick={handleLaunch}
                disabled={launching}
              >
                {launching ? '⏳ Launching...' : '🚀 Launch Token Now!'}
              </button>
            </div>
          )}

          {/* Creator Status */}
          {isCreator && !isFull && !isLaunched && !isFailed && (
            <div className="creator-status">
              <h3>👑 You're the Creator</h3>
              <p>Share this presale link to get {presale.target_participants} participants</p>
              <code className="share-link">{typeof window !== 'undefined' ? window.location.href : ''}</code>
            </div>
          )}

          {/* Connect Wallet Prompt */}
          {!connected && canJoin && (
            <div className="connect-prompt">
              <p>Connect wallet to join this presale</p>
              <WalletMultiButton className="wallet-btn-large" />
            </div>
          )}

          {/* Messages */}
          {error && <div className="error-msg">{error}</div>}
          {success && <div className="success-msg">{success}</div>}
        </div>

        {/* Participants List */}
        <div className="participants-section">
          <h3>Participants ({participants.length + 1}/{presale.target_participants + 1})</h3>
          <div className="participants-list">
            {/* Creator */}
            <div className="participant creator">
              <span className="wallet">
                👑 {presale.creator_wallet.slice(0, 4)}...{presale.creator_wallet.slice(-4)}
              </span>
              <span className="badge">Creator</span>
            </div>
            
            {participants.map((p, i) => (
              <div key={i} className="participant">
                <span className="wallet">{p.wallet_short}</span>
                <span className="amount">{p.amount_sol.toFixed(2)} SOL</span>
              </div>
            ))}
            
            {/* Empty slots */}
            {Array(Math.max(0, presale.target_participants - participants.length)).fill(0).map((_, i) => (
              <div key={`empty-${i}`} className="participant empty">
                <span className="wallet">Empty Slot</span>
                <span className="amount">---</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          background: #050505;
          color: white;
        }
        .nav {
          position: sticky;
          top: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: rgba(5, 5, 5, 0.95);
          border-bottom: 1px solid rgba(0, 255, 136, 0.1);
          backdrop-filter: blur(10px);
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .nav-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .toggle {
          color: var(--muted, #888);
          text-decoration: none;
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 6px;
        }
        .toggle:hover {
          color: #00ff88;
          background: rgba(0, 255, 136, 0.1);
        }
        .toggle.cta {
          background: var(--accent);
          color: #000;
          font-weight: 600;
        }
        .content {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        .token-header {
          display: flex;
          gap: 20px;
          align-items: flex-start;
          margin-bottom: 20px;
          position: relative;
        }
        .token-image {
          width: 80px;
          height: 80px;
          border-radius: 16px;
          object-fit: cover;
        }
        .token-info h1 {
          font-size: 24px;
          margin: 0 0 8px 0;
        }
        .symbol {
          color: #00ff88;
          font-size: 18px;
        }
        .description {
          color: #888;
          font-size: 14px;
          margin: 0 0 10px 0;
        }
        .links {
          display: flex;
          gap: 12px;
        }
        .links a {
          color: #00ff88;
          text-decoration: none;
          font-size: 12px;
        }
        .status-badge {
          position: absolute;
          top: 0;
          right: 0;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
        }
        .status-badge.active { background: rgba(0, 255, 136, 0.2); color: #00ff88; }
        .status-badge.launched { background: rgba(100, 200, 255, 0.2); color: #64c8ff; }
        .status-badge.failed { background: rgba(255, 100, 100, 0.2); color: #ff6464; }
        .countdown-box {
          text-align: center;
          background: rgba(0, 255, 136, 0.05);
          border: 1px solid rgba(0, 255, 136, 0.2);
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .countdown-label {
          color: #888;
          font-size: 12px;
          text-transform: uppercase;
        }
        .countdown-value {
          font-size: 48px;
          font-weight: 800;
          color: #00ff88;
          font-family: monospace;
        }
        .countdown-sub {
          color: #666;
          font-size: 12px;
        }
        .success-banner, .failed-banner {
          text-align: center;
          padding: 16px;
          border-radius: 12px;
          margin-bottom: 20px;
          font-weight: 600;
        }
        .success-banner {
          background: rgba(0, 255, 136, 0.1);
          border: 1px solid rgba(0, 255, 136, 0.3);
          color: #00ff88;
        }
        .success-banner a {
          display: block;
          margin-top: 8px;
          color: white;
        }
        .failed-banner {
          background: rgba(255, 100, 100, 0.1);
          border: 1px solid rgba(255, 100, 100, 0.3);
          color: #ff6464;
        }
        .progress-section {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .progress-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
          font-size: 14px;
        }
        .progress-bar {
          height: 12px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00ff88, #00cc6a);
          border-radius: 6px;
          transition: width 0.3s ease;
        }
        .progress-stats {
          display: flex;
          justify-content: space-between;
          margin-top: 12px;
        }
        .stat {
          text-align: center;
        }
        .stat-label {
          display: block;
          color: #666;
          font-size: 11px;
          text-transform: uppercase;
        }
        .stat-value {
          font-weight: 600;
          color: #00ff88;
        }
        .action-section {
          background: rgba(0, 255, 136, 0.03);
          border: 1px solid rgba(0, 255, 136, 0.15);
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 20px;
        }
        .join-form h3, .joined-status h3, .launch-section h3, .creator-status h3 {
          margin: 0 0 8px 0;
          font-size: 18px;
        }
        .join-form p, .joined-status p, .launch-section p, .creator-status p {
          color: #888;
          font-size: 14px;
          margin: 0 0 16px 0;
        }
        .amount-input {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }
        .amount-input input {
          flex: 1;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(0, 255, 136, 0.3);
          border-radius: 8px;
          padding: 12px;
          color: white;
          font-size: 18px;
        }
        .sol-label {
          display: flex;
          align-items: center;
          padding: 0 12px;
          background: rgba(0, 255, 136, 0.1);
          border-radius: 8px;
          font-weight: 600;
          color: #00ff88;
        }
        .quick-amounts {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }
        .quick-amounts button {
          flex: 1;
          padding: 8px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #888;
          cursor: pointer;
        }
        .quick-amounts button.active {
          border-color: #00ff88;
          color: #00ff88;
        }
        .btn {
          width: 100%;
          padding: 14px;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn.primary {
          background: linear-gradient(135deg, #00ff88, #00cc6a);
          color: #000;
        }
        .btn.secondary {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn.large {
          font-size: 18px;
          padding: 18px;
        }
        .muted {
          color: #666 !important;
          font-size: 12px !important;
        }
        .share-link {
          display: block;
          padding: 10px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 6px;
          font-size: 12px;
          word-break: break-all;
          margin-top: 10px;
        }
        .connect-prompt {
          text-align: center;
        }
        .error-msg {
          background: rgba(255, 100, 100, 0.1);
          border: 1px solid rgba(255, 100, 100, 0.3);
          color: #ff6464;
          padding: 12px;
          border-radius: 8px;
          margin-top: 12px;
        }
        .success-msg {
          background: rgba(0, 255, 136, 0.1);
          border: 1px solid rgba(0, 255, 136, 0.3);
          color: #00ff88;
          padding: 12px;
          border-radius: 8px;
          margin-top: 12px;
        }
        .participants-section {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 20px;
        }
        .participants-section h3 {
          margin: 0 0 16px 0;
        }
        .participants-list {
          display: grid;
          gap: 8px;
          max-height: 300px;
          overflow-y: auto;
        }
        .participant {
          display: flex;
          justify-content: space-between;
          padding: 10px 12px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          font-size: 13px;
        }
        .participant.creator {
          background: rgba(255, 215, 0, 0.1);
          border: 1px solid rgba(255, 215, 0, 0.3);
        }
        .participant.empty {
          opacity: 0.3;
        }
        .badge {
          background: rgba(255, 215, 0, 0.2);
          color: #ffd700;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
        }
        .amount {
          color: #00ff88;
          font-weight: 600;
        }
      `}</style>

      <style jsx global>{`
        .wallet-btn, .wallet-btn-large {
          background: rgba(0, 255, 136, 0.1) !important;
          border: 1px solid rgba(0, 255, 136, 0.3) !important;
          border-radius: 8px !important;
          color: #00ff88 !important;
          font-weight: 600 !important;
        }
      `}</style>
    </div>
  );
}
