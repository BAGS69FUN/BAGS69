'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL 
} from '@solana/web3.js';
import { 
  PRESALE_CONFIG, 
  LAUNCHER_WALLET 
} from '@/lib/constants';

type PresaleForm = {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  twitter: string;
  website: string;
  minSol: string;
  maxSol: string;
  durationMinutes: number;
  targetParticipants: number;
};

export default function CreatePresalePage() {
  const router = useRouter();
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();
  
  const [form, setForm] = useState<PresaleForm>({
    name: '',
    symbol: '',
    description: '',
    imageUrl: '',
    twitter: '',
    website: '',
    minSol: String(PRESALE_CONFIG.DEFAULT_MIN_SOL),
    maxSol: String(PRESALE_CONFIG.DEFAULT_MAX_SOL),
    durationMinutes: PRESALE_CONFIG.DURATION_OPTIONS[2], // 30 min default
    targetParticipants: PRESALE_CONFIG.DEFAULT_PARTICIPANTS, // 68 default
  });
  
  // Step 1: Pay launch fee, Step 2: Create presale
  const [step, setStep] = useState<1 | 2>(1);
  const [launchFeeSignature, setLaunchFeeSignature] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [payingFee, setPayingFee] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onChange<K extends keyof PresaleForm>(key: K, v: PresaleForm[K]) {
    setForm(prev => ({ ...prev, [key]: v }));
  }

  const canPayFee = useMemo(() => {
    return connected && publicKey && signTransaction;
  }, [connected, publicKey, signTransaction]);

  const canCreate = useMemo(() => {
    return connected && 
           publicKey && 
           launchFeeSignature &&
           form.name && 
           form.symbol && 
           form.symbol.length <= 10 && 
           form.description && 
           form.imageUrl;
  }, [connected, publicKey, launchFeeSignature, form]);

  // Step 1: Pay launch fee
  const handlePayLaunchFee = async () => {
    if (!publicKey || !signTransaction) {
      setError('Please connect your wallet');
      return;
    }
    
    setPayingFee(true);
    setError(null);
    
    try {
      const launcherPubkey = new PublicKey(LAUNCHER_WALLET);
      const lamports = Math.round(PRESALE_CONFIG.LAUNCH_FEE_SOL * LAMPORTS_PER_SOL);
      
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: launcherPubkey,
          lamports,
        })
      );
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      
      const signedTx = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      
      // Wait for confirmation
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      
      setLaunchFeeSignature(signature);
      setStep(2);
      
    } catch (e: any) {
      console.error('Launch fee payment error:', e);
      setError(e.message || 'Failed to pay launch fee');
    } finally {
      setPayingFee(false);
    }
  };

  // Step 2: Create presale
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!publicKey || !launchFeeSignature) {
      setError('Please complete launch fee payment first');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch('/api/presale/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator_wallet: publicKey.toBase58(),
          token_name: form.name,
          token_symbol: form.symbol,
          description: form.description,
          image_url: form.imageUrl,
          twitter: form.twitter || undefined,
          website: form.website || undefined,
          min_sol_per_wallet: parseFloat(form.minSol) || PRESALE_CONFIG.DEFAULT_MIN_SOL,
          max_sol_per_wallet: parseFloat(form.maxSol) || PRESALE_CONFIG.DEFAULT_MAX_SOL,
          duration_minutes: form.durationMinutes,
          target_participants: form.targetParticipants,
          launch_fee_signature: launchFeeSignature,
        }),
      });
      
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to create presale');
      }
      
      // Redirect to presale page
      router.push(`/presale/${data.presale.id}`);
      
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wrap">
      <div className="stars" />
      <div className="twinkle" />
      
      <header className="nav">
        <div className="brand">
          <img src="/bags.gif" alt="LOB" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <span style={{ fontWeight: 800, fontSize: 15 }}>BAGS69 <span style={{ color: 'var(--accent)' }}>$69</span></span>
        </div>
        <div className="nav-right">
          <a className="toggle" href="/">Home</a>
          <a className="toggle" href="/presales">All Presales</a>
          <a className="toggle" href="/launched">Launched</a>
          <a className="toggle" href="/claim">Claim Fees</a>
          <a className="toggle" href="/docs.html">Docs</a>
          <a className="toggle cta" href="/presale/create">Create</a>
          <WalletMultiButton className="wallet-btn" />
        </div>
      </header>

      <main className="hero">
        <section className="panel" style={{ textAlign: 'left', maxWidth: 700, width: '100%' }}>
          <h1 className="headline" style={{ textAlign: 'center', fontSize: 'clamp(20px, 3vw, 28px)', marginBottom: 8 }}>
            <span className="glitch" data-text="Create Presale">Create Presale</span>
          </h1>
          
          <p className="sub" style={{ textAlign: 'center', fontSize: 12, marginBottom: 16 }}>
            Choose 1-68 participants • {PRESALE_CONFIG.CREATOR_ALLOCATION_BPS / 100}% creator allocation • Auto-launch when filled
          </p>

          {/* How it works */}
          <div style={{ 
            background: 'rgba(0, 255, 136, 0.05)', 
            border: '1px solid rgba(0, 255, 136, 0.15)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}>
            <h3 style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 10 }}>🚀 How BAGS69 Works</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontSize: 11 }}>
              <div style={{ textAlign: 'center', padding: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>1️⃣</div>
                <div style={{ color: 'var(--muted)' }}>Pay {PRESALE_CONFIG.LAUNCH_FEE_SOL} SOL fee</div>
              </div>
              <div style={{ textAlign: 'center', padding: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>2️⃣</div>
                <div style={{ color: 'var(--muted)' }}>1-68 wallets join</div>
              </div>
              <div style={{ textAlign: 'center', padding: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>3️⃣</div>
                <div style={{ color: 'var(--muted)' }}>Token auto-launches</div>
              </div>
              <div style={{ textAlign: 'center', padding: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>4️⃣</div>
                <div style={{ color: 'var(--muted)' }}>All earn fees!</div>
              </div>
            </div>
            <p style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
              If target not met in time, participants get full refund. Launch fee is non-refundable.
            </p>
          </div>

          {/* Step indicator */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            gap: 20, 
            marginBottom: 20,
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8,
              opacity: step === 1 ? 1 : 0.5,
            }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: step >= 1 ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                color: step >= 1 ? '#000' : 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 12,
              }}>
                {launchFeeSignature ? '✓' : '1'}
              </div>
              <span style={{ fontSize: 12, color: step === 1 ? 'var(--accent)' : 'var(--muted)' }}>
                Pay Launch Fee
              </span>
            </div>
            
            <div style={{ color: 'var(--muted)' }}>→</div>
            
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8,
              opacity: step === 2 ? 1 : 0.5,
            }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: step === 2 ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                color: step === 2 ? '#000' : 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 12,
              }}>
                2
              </div>
              <span style={{ fontSize: 12, color: step === 2 ? 'var(--accent)' : 'var(--muted)' }}>
                Create Presale
              </span>
            </div>
          </div>

          {!connected && (
            <div style={{ textAlign: 'center', padding: 30 }}>
              <p style={{ marginBottom: 12, color: 'var(--muted)' }}>Connect wallet to create a presale</p>
              <WalletMultiButton className="wallet-btn-large" />
            </div>
          )}

          {connected && publicKey && step === 1 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                background: 'rgba(255, 215, 0, 0.05)',
                border: '1px solid rgba(255, 215, 0, 0.2)',
                borderRadius: 12,
                padding: 20,
                marginBottom: 16,
              }}>
                <h3 style={{ color: '#ffd700', marginBottom: 12 }}>💰 Launch Fee Required</h3>
                <p style={{ fontSize: 13, marginBottom: 8 }}>
                  Pay <strong style={{ color: 'var(--accent)' }}>{PRESALE_CONFIG.LAUNCH_FEE_SOL} SOL</strong> to create your presale
                </p>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
                  This fee covers automatic token deployment. Non-refundable.
                </p>
                
                <button
                  className="btn primary"
                  onClick={handlePayLaunchFee}
                  disabled={!canPayFee || payingFee}
                  style={{ padding: '12px 24px', fontSize: 14 }}
                >
                  {payingFee ? '⏳ Processing...' : `💳 Pay ${PRESALE_CONFIG.LAUNCH_FEE_SOL} SOL`}
                </button>
              </div>
              
              {error && (
                <div style={{ 
                  background: 'rgba(255, 100, 100, 0.1)', 
                  border: '1px solid rgba(255, 100, 100, 0.3)',
                  borderRadius: 8,
                  padding: 10,
                  color: '#ff6b6b',
                  fontSize: 12,
                }}>
                  {error}
                </div>
              )}
            </div>
          )}

          {connected && publicKey && step === 2 && (
            <div>
              {/* Launch fee paid confirmation */}
              <div style={{
                background: 'rgba(0, 255, 136, 0.08)',
                border: '1px solid rgba(0, 255, 136, 0.2)',
                borderRadius: 8,
                padding: 10,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 12, color: 'var(--accent)' }}>
                  ✅ Launch fee paid
                </span>
                <a 
                  href={`https://solscan.io/tx/${launchFeeSignature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, color: 'var(--muted)' }}
                >
                  View tx →
                </a>
              </div>
              
              <form onSubmit={handleCreate} style={{ display: 'grid', gap: 12 }}>
                {/* Token Info */}
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '2fr 1fr' }}>
                  <label className="form-field">
                    <span className="form-label">Token Name *</span>
                    <input
                      required
                      value={form.name}
                      onChange={e => onChange('name', e.target.value)}
                      placeholder="My Fair Token"
                      className="form-input form-input-sm"
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Symbol *</span>
                    <input
                      required
                      value={form.symbol}
                      onChange={e => onChange('symbol', e.target.value.toUpperCase())}
                      placeholder="FAIR"
                      maxLength={10}
                      className="form-input form-input-sm"
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                  <label className="form-field">
                    <span className="form-label">Description *</span>
                    <textarea
                      required
                      value={form.description}
                      onChange={e => onChange('description', e.target.value)}
                      placeholder="Describe your token..."
                      className="form-input form-input-sm"
                      rows={2}
                      style={{ resize: 'none' }}
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Image URL *</span>
                    <input
                      required
                      type="url"
                      value={form.imageUrl}
                      onChange={e => onChange('imageUrl', e.target.value)}
                      placeholder="https://example.com/logo.png"
                      className="form-input form-input-sm"
                    />
                  </label>
                </div>

                {/* Social Links */}
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                  <label className="form-field">
                    <span className="form-label">Twitter (optional)</span>
                    <input
                      value={form.twitter}
                      onChange={e => onChange('twitter', e.target.value)}
                      placeholder="https://twitter.com/yourtoken"
                      className="form-input form-input-sm"
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Website (optional)</span>
                    <input
                      value={form.website}
                      onChange={e => onChange('website', e.target.value)}
                      placeholder="https://yourtoken.com"
                      className="form-input form-input-sm"
                    />
                  </label>
                </div>

                {/* Configuration */}
                <div className="form-field" style={{ 
                  background: 'rgba(255, 215, 0, 0.03)', 
                  border: '1px solid rgba(255, 215, 0, 0.1)',
                  borderRadius: 10,
                  padding: 12,
                }}>
                  <span className="form-label" style={{ color: '#ffd700' }}>⚙️ Presale Configuration</span>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 10 }}>
                    <label className="form-field">
                      <span className="form-label" style={{ fontSize: 9 }}>Target Participants</span>
                      <input
                        type="number"
                        min={PRESALE_CONFIG.MIN_PARTICIPANTS}
                        max={PRESALE_CONFIG.MAX_PARTICIPANTS}
                        value={form.targetParticipants}
                        onChange={e => onChange('targetParticipants', Math.min(PRESALE_CONFIG.MAX_PARTICIPANTS, Math.max(PRESALE_CONFIG.MIN_PARTICIPANTS, parseInt(e.target.value) || 1)))}
                        className="form-input form-input-sm"
                      />
                      <span style={{ fontSize: 8, color: 'var(--muted)' }}>1-68 (auto-launch when filled)</span>
                    </label>
                    <label className="form-field">
                      <span className="form-label" style={{ fontSize: 9 }}>Duration</span>
                      <select
                        value={form.durationMinutes}
                        onChange={e => onChange('durationMinutes', parseInt(e.target.value))}
                        className="form-input form-input-sm"
                      >
                        {PRESALE_CONFIG.DURATION_OPTIONS.map(mins => (
                          <option key={mins} value={mins}>{mins} minutes</option>
                        ))}
                      </select>
                    </label>
                    <label className="form-field">
                      <span className="form-label" style={{ fontSize: 9 }}>Min SOL per Wallet</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={form.minSol}
                        onChange={e => onChange('minSol', e.target.value)}
                        className="form-input form-input-sm"
                      />
                    </label>
                    <label className="form-field">
                      <span className="form-label" style={{ fontSize: 9 }}>Max SOL per Wallet</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={form.maxSol}
                        onChange={e => onChange('maxSol', e.target.value)}
                        className="form-input form-input-sm"
                      />
                    </label>
                  </div>
                </div>

                {/* Summary */}
                <div style={{ 
                  background: 'rgba(0, 255, 136, 0.08)', 
                  borderRadius: 10, 
                  padding: 12,
                  fontSize: 11,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--muted)' }}>Total Wallets</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {form.targetParticipants} + Creator = {form.targetParticipants + 1}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--muted)' }}>Auto-Launch</span>
                    <span style={{ color: '#00ff88' }}>When {form.targetParticipants} participants join</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--muted)' }}>Creator Allocation</span>
                    <span style={{ color: '#ffd700', fontWeight: 600 }}>
                      {PRESALE_CONFIG.CREATOR_ALLOCATION_BPS / 100}% guaranteed
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--muted)' }}>Duration</span>
                    <span>{form.durationMinutes} minutes</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--muted)' }}>Contribution Range</span>
                    <span>{form.minSol} - {form.maxSol} SOL</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)' }}>Withdrawal Tax</span>
                    <span style={{ color: '#ff9900' }}>{PRESALE_CONFIG.WITHDRAWAL_TAX_BPS / 100}% (active presale only)</span>
                  </div>
                </div>

                {error && (
                  <div style={{ 
                    background: 'rgba(255, 100, 100, 0.1)', 
                    border: '1px solid rgba(255, 100, 100, 0.3)',
                    borderRadius: 8,
                    padding: 10,
                    color: '#ff6b6b',
                    fontSize: 12,
                  }}>
                    {error}
                  </div>
                )}

                <button 
                  className="btn primary" 
                  type="submit" 
                  disabled={!canCreate || loading}
                  style={{ padding: '12px 24px', fontSize: 14 }}
                >
                  {loading ? '⏳ Creating...' : '🚀 Create Presale'}
                </button>

                <p style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center' }}>
                  You'll get {PRESALE_CONFIG.CREATOR_ALLOCATION_BPS / 100}% of trading fees as creator • 
                  Remaining {(10000 - PRESALE_CONFIG.CREATOR_ALLOCATION_BPS) / 100}% shared with {form.targetParticipants} participants proportionally
                </p>
              </form>
            </div>
          )}
        </section>
      </main>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          background: #050505;
          color: var(--ink);
          position: relative;
          overflow-x: hidden;
        }
        .stars, .twinkle {
          position: fixed;
          inset: 0;
          pointer-events: none;
        }
        .nav {
          position: sticky;
          top: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: rgba(5, 5, 5, 0.9);
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
          color: var(--muted);
          text-decoration: none;
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .toggle:hover, .toggle.active {
          color: var(--accent);
          background: rgba(0, 255, 136, 0.1);
        }
        .hero {
          padding: 30px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .panel {
          background: rgba(0, 255, 136, 0.02);
          border: 1px solid rgba(0, 255, 136, 0.1);
          border-radius: 20px;
          padding: 24px;
        }
        .headline {
          font-weight: 800;
          line-height: 1.1;
        }
        .sub {
          color: var(--muted);
        }
        .form-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .form-label {
          font-size: 10px;
          font-weight: 600;
          color: var(--accent);
          text-transform: uppercase;
        }
        .form-input, .form-input-sm {
          background: rgba(0, 255, 136, 0.05);
          border: 1px solid rgba(0, 255, 136, 0.2);
          border-radius: 8px;
          padding: 10px 12px;
          color: var(--ink);
          font-size: 13px;
          outline: none;
        }
        .form-input-sm {
          padding: 8px 10px;
          font-size: 12px;
        }
        .form-input:focus, .form-input-sm:focus {
          border-color: var(--accent);
        }
        select.form-input-sm {
          cursor: pointer;
        }
        .btn {
          border: none;
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn.primary {
          background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
          color: #000;
        }
        .btn.primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(0, 255, 136, 0.3);
        }
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>

      <style jsx global>{`
        .wallet-btn, .wallet-btn-large {
          background: rgba(0, 255, 136, 0.1) !important;
          border: 1px solid rgba(0, 255, 136, 0.3) !important;
          border-radius: 8px !important;
          color: var(--green, #00ff88) !important;
          font-weight: 600 !important;
          font-size: 12px !important;
        }
      `}</style>
    </div>
  );
}
