'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

interface PresaleSummary {
  id: string;
  token_name: string;
  token_symbol: string;
  image_url: string;
  status: string;
  participant_count: number;
  target_participants: number;
  total_sol: number;
  progress_percent: number;
  expires_at: string;
  created_at: string;
  token_mint?: string;
}

const ITEMS_PER_PAGE = 12;

export default function PresalesListPage() {
  const [presales, setPresales] = useState<PresaleSummary[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, launched: 0, failed: 0 });
  const [page, setPage] = useState(1);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const prevIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetchPresales();
    const interval = setInterval(fetchPresales, 15000);
    return () => clearInterval(interval);
  }, [filter]);

  const fetchPresales = async () => {
    try {
      const res = await fetch(`/api/presale?filter=${filter}&limit=100`);
      const data = await res.json();
      if (data.success) {
        let sorted = data.presales || [];
        // Sort by total_sol (most raised first)
        sorted.sort((a: PresaleSummary, b: PresaleSummary) => b.total_sol - a.total_sol);
        
        // Detect new presales for flash animation
        const currentIds = new Set<string>(sorted.map((p: PresaleSummary) => p.id));
        const newOnes = new Set<string>();
        currentIds.forEach((id: string) => {
          if (!prevIdsRef.current.has(id)) newOnes.add(id);
        });
        if (newOnes.size > 0 && prevIdsRef.current.size > 0) {
          setNewIds(newOnes);
          setTimeout(() => setNewIds(new Set()), 3000);
        }
        prevIdsRef.current = currentIds;
        
        setPresales(sorted);
        setStats(data.stats);
      }
    } catch (e) {
      console.error('Failed to fetch presales:', e);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(presales.length / ITEMS_PER_PAGE);
  const paginatedPresales = presales.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const getTimeRemaining = (expiresAt: string, status: string) => {
    if (status !== 'active') return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getStatusColor = (status: string) => {
    if (status === 'active') return '#00ff88';
    if (status === 'launched') return '#a855f7';
    return '#ff6b6b';
  };

  return (
    <div className="wrap">
      <header className="nav">
        <a href="/" className="brand">
          <img src="/bags.gif" alt="BAGS69" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <span style={{ fontWeight: 800, fontSize: 15 }}>BAGS69 <span style={{ color: '#00ff88' }}>$69</span></span>
        </a>
        <div className="nav-right">
          <a className="toggle" href="/">Home</a>
          <a className="toggle active" href="/presales">Presales</a>
          <a className="toggle" href="/launched">Launched</a>
          <a className="toggle" href="/claim">Claim Fees</a>
          <a className="toggle" href="/docs.html">Docs</a>
          <a className="toggle cta" href="/presale/create">Create</a>
          <WalletMultiButton className="wallet-btn" />
        </div>
      </header>

      <main className="content">
        <div className="stats-row">
          {[
            { key: 'all', label: 'TOTAL', value: stats.total, color: '#fff' },
            { key: 'active', label: 'ACTIVE', value: stats.active, color: '#00ff88' },
            { key: 'launched', label: 'LAUNCHED', value: stats.launched, color: '#a855f7' },
            { key: 'failed', label: 'FAILED', value: stats.failed, color: '#ff6b6b' },
          ].map(s => (
            <div key={s.key} className={`stat-card ${filter === s.key ? 'active' : ''}`} onClick={() => { setFilter(s.key); setPage(1); }}>
              <span className="stat-num" style={{ color: s.color }}>{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="filter-tabs">
          {['all', 'active', 'launched', 'failed'].map(f => (
            <button key={f} className={`filter-btn ${filter === f ? 'active' : ''}`} onClick={() => { setFilter(f); setPage(1); }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading"><div className="loader"></div><p>Loading...</p></div>
        ) : presales.length === 0 ? (
          <div className="empty">
            <span style={{ fontSize: 48 }}>📭</span>
            <p>No presales found</p>
            <Link href="/presale/create" className="btn-cta">Create First Presale →</Link>
          </div>
        ) : (
          <>
            <div className="grid">
              {paginatedPresales.map((presale, idx) => {
                const timeLeft = getTimeRemaining(presale.expires_at, presale.status);
                const isNew = newIds.has(presale.id);
                
                return (
                  <Link href={`/presale/${presale.id}`} key={presale.id} className={`card ${isNew ? 'flash' : ''}`} style={{ animationDelay: `${idx * 0.05}s` }}>
                    <div className="card-header">
                      <img src={presale.image_url || '/bags.gif'} alt={presale.token_name} className="token-img" onError={(e) => { (e.target as HTMLImageElement).src = '/bags.gif'; }} />
                      <div className="token-info">
                        <div className="token-symbol">{presale.token_symbol}</div>
                        <div className="token-name">{presale.token_name}</div>
                      </div>
                      <span className="status-badge" style={{ background: `${getStatusColor(presale.status)}20`, color: getStatusColor(presale.status), borderColor: getStatusColor(presale.status) }}>
                        {presale.status === 'active' ? '🟢' : presale.status === 'launched' ? '🚀' : '❌'} {presale.status}
                      </span>
                    </div>

                    <div className="progress-section">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${presale.progress_percent}%`, background: getStatusColor(presale.status) }}></div>
                      </div>
                      <div className="progress-info">
                        <span>{presale.progress_percent}% filled</span>
                        {timeLeft && <span className="time-left">⏱️ {timeLeft}</span>}
                      </div>
                    </div>

                    <div className="stats-grid">
                      <div className="stat"><span className="label">Participants</span><span className="value">{presale.participant_count}/{presale.target_participants}</span></div>
                      <div className="stat"><span className="label">Raised</span><span className="value sol">{presale.total_sol.toFixed(2)} SOL</span></div>
                    </div>

                    <div className="card-footer">
                      <span className="presale-id">#{presale.id}</span>
                      <span className="view-link">View Details →</span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
                <span>Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
              </div>
            )}
          </>
        )}
      </main>

      <style jsx>{`
        .wrap { min-height: 100vh; background: linear-gradient(180deg, #0a0a0a 0%, #0d1117 100%); color: #fff; }
        .nav { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(10,10,10,0.95); backdrop-filter: blur(20px); position: sticky; top: 0; z-index: 100; }
        .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: #fff; }
        .nav-right { display: flex; align-items: center; gap: 6px; }
        .toggle { padding: 8px 14px; border-radius: 8px; text-decoration: none; color: #666; font-size: 13px; font-weight: 500; transition: all 0.2s; }
        .toggle:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .toggle.active { color: #00ff88; background: rgba(0,255,136,0.1); }
        .toggle.cta { background: #00ff88; color: #000; font-weight: 600; }
        
        .content { max-width: 1400px; margin: 0 auto; padding: 32px 24px; }
        
        .stats-row { display: flex; justify-content: center; gap: 12px; margin-bottom: 24px; }
        .stat-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px 28px; text-align: center; cursor: pointer; transition: all 0.2s; }
        .stat-card:hover, .stat-card.active { border-color: #00ff88; background: rgba(0,255,136,0.05); }
        .stat-num { display: block; font-size: 26px; font-weight: 800; }
        .stat-label { font-size: 10px; color: #666; font-weight: 600; letter-spacing: 1px; }
        
        .filter-tabs { display: flex; justify-content: center; gap: 8px; margin-bottom: 28px; }
        .filter-btn { padding: 8px 18px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #888; font-size: 13px; cursor: pointer; transition: all 0.2s; }
        .filter-btn:hover { color: #fff; border-color: rgba(255,255,255,0.3); }
        .filter-btn.active { background: #00ff88; color: #000; border-color: #00ff88; font-weight: 600; }
        
        .loading, .empty { text-align: center; padding: 80px 20px; }
        .loader { width: 40px; height: 40px; border: 3px solid rgba(0,255,136,0.1); border-top-color: #00ff88; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .btn-cta { display: inline-block; margin-top: 16px; padding: 12px 24px; background: #00ff88; color: #000; border-radius: 10px; font-weight: 700; text-decoration: none; }
        
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        @media (max-width: 1200px) { .grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 900px) { .grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
        
        .card { display: block; background: rgba(15,15,20,0.95); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 14px; text-decoration: none; color: inherit; animation: fadeIn 0.4s ease forwards; opacity: 0; transition: all 0.3s; }
        .card:hover { border-color: rgba(0,255,136,0.4); transform: translateY(-4px); box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(0,255,136,0.1); }
        .card.flash { animation: flash 0.5s ease-out, fadeIn 0.4s ease forwards; }
        @keyframes fadeIn { to { opacity: 1; } }
        @keyframes flash { 0%, 100% { box-shadow: 0 0 0 rgba(0,255,136,0); } 50% { box-shadow: 0 0 30px rgba(0,255,136,0.8), 0 0 60px rgba(0,255,136,0.4); } }
        
        .card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .token-img { width: 44px; height: 44px; border-radius: 10px; border: 2px solid rgba(255,255,255,0.1); object-fit: cover; }
        .token-info { flex: 1; min-width: 0; }
        .token-symbol { font-size: 15px; font-weight: 700; color: #fff; }
        .token-name { font-size: 11px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .status-badge { font-size: 10px; font-weight: 600; padding: 4px 8px; border-radius: 6px; border: 1px solid; text-transform: capitalize; }
        
        .progress-section { margin-bottom: 10px; }
        .progress-bar { height: 5px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
        .progress-info { display: flex; justify-content: space-between; font-size: 10px; color: #666; margin-top: 4px; }
        .time-left { color: #f7931a; }
        
        .stats-grid { display: flex; justify-content: space-between; margin-bottom: 10px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; }
        .stat { text-align: center; flex: 1; }
        .stat .label { display: block; font-size: 9px; color: #555; text-transform: uppercase; }
        .stat .value { display: block; font-size: 13px; font-weight: 600; color: #fff; }
        .stat .value.sol { color: #00ff88; }
        
        .card-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); }
        .presale-id { font-size: 10px; color: #444; font-family: monospace; }
        .view-link { font-size: 11px; color: #00ff88; font-weight: 600; }
        
        .pagination { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 40px; }
        .pagination button { padding: 10px 20px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; cursor: pointer; }
        .pagination button:hover:not(:disabled) { border-color: #00ff88; }
        .pagination button:disabled { opacity: 0.3; cursor: not-allowed; }
        .pagination span { color: #666; font-size: 14px; }
      `}</style>
      <style jsx global>{`
        .wallet-btn { background: rgba(0,255,136,0.1) !important; border: 1px solid rgba(0,255,136,0.3) !important; border-radius: 8px !important; color: #00ff88 !important; font-weight: 600 !important; font-size: 12px !important; }
      `}</style>
    </div>
  );
}
