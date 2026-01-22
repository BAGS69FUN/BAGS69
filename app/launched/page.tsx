'use client';

import React, { useState, useEffect } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

interface LaunchedToken {
  id: string;
  token_name: string;
  token_symbol: string;
  image_url: string;
  token_mint: string;
  total_sol: number;
  participant_count: number;
  creator_wallet: string;
  launched_at: string;
  twitter?: string;
  website?: string;
  jupiterData?: JupiterTokenData | null;
}

interface JupiterTokenData {
  name: string;
  symbol: string;
  icon: string;
  holderCount?: number;
  mcap?: number;
  usdPrice?: number;
  liquidity?: number;
  bondingCurve?: number;
  graduatedPool?: string;
  stats24h?: {
    priceChange?: number;
    buyVolume?: number;
    sellVolume?: number;
  };
}

const ITEMS_PER_PAGE = 12;
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const generateSparkline = () => {
  const points = [];
  let value = 50 + Math.random() * 30;
  for (let i = 0; i < 20; i++) {
    value += (Math.random() - 0.5) * 15;
    value = Math.max(10, Math.min(90, value));
    points.push(value);
  }
  return points;
};

const Sparkline = ({ data, color }: { data: number[], color: string }) => {
  const width = 70;
  const height = 28;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - (v / 100) * height}`).join(' ');
  return (
    <svg width={width} height={height}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
};

export default function LaunchedPage() {
  const [tokens, setTokens] = useState<LaunchedToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sparklines, setSparklines] = useState<{ [key: string]: number[] }>({});

  const fetchJupiterData = async (mint: string): Promise<JupiterTokenData | null> => {
    try {
      const res = await fetch(`https://datapi.jup.ag/v1/assets/search?query=${mint}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const token = data[0];
        return {
          name: token.name,
          symbol: token.symbol,
          icon: token.icon,
          holderCount: token.holderCount,
          mcap: token.mcap,
          usdPrice: token.usdPrice,
          liquidity: token.liquidity,
          bondingCurve: token.bondingCurve,
          graduatedPool: token.graduatedPool,
          stats24h: token.stats24h,
        };
      }
    } catch (e) {
      console.error('Failed to fetch Jupiter data:', e);
    }
    return null;
  };

  useEffect(() => {
    const fetchTokens = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/presale?filter=launched');
        const data = await res.json();
        
        if (data.success) {
          const presales = data.presales || [];
          const enrichedTokens = await Promise.all(
            presales.map(async (token: LaunchedToken) => {
              if (token.token_mint) {
                const jupiterData = await fetchJupiterData(token.token_mint);
                return { ...token, jupiterData };
              }
              return { ...token, jupiterData: null };
            })
          );
          
          // Sort by market cap (highest first)
          enrichedTokens.sort((a, b) => {
            const mcapA = a.jupiterData?.mcap || 0;
            const mcapB = b.jupiterData?.mcap || 0;
            return mcapB - mcapA;
          });
          
          setTokens(enrichedTokens);
          
          const lines: { [key: string]: number[] } = {};
          enrichedTokens.forEach(t => { lines[t.id] = generateSparkline(); });
          setSparklines(lines);
        }
      } catch (e) {
        console.error('Failed to fetch tokens:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchTokens();
  }, []);

  const totalPages = Math.ceil(tokens.length / ITEMS_PER_PAGE);
  const paginatedTokens = tokens.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const formatPrice = (price: number | undefined): string => {
    if (!price || price === 0) return '$0';
    if (price < 0.000001) return '$' + price.toFixed(10).replace(/\.?0+$/, '');
    if (price < 0.0001) return '$' + price.toFixed(8).replace(/\.?0+$/, '');
    if (price < 0.01) return '$' + price.toFixed(6);
    if (price < 1) return '$' + price.toFixed(4);
    return '$' + price.toFixed(2);
  };

  const formatCompact = (num: number | undefined): string => {
    if (!num) return '$0';
    if (num >= 1_000_000) return '$' + (num / 1_000_000).toFixed(2) + 'M';
    if (num >= 1_000) return '$' + (num / 1_000).toFixed(2) + 'K';
    return '$' + num.toFixed(0);
  };

  const shortenAddress = (addr: string) => addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : '';

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
          <a className="toggle active" href="/launched">Launched</a>
          <a className="toggle" href="/claim">Claim Fees</a>
          <a className="toggle" href="/docs.html">Docs</a>
          <a className="toggle cta" href="/presale/create">Create</a>
          <WalletMultiButton className="wallet-btn" />
        </div>
      </header>

      <main className="content">
        <div className="page-header">
          <h1>🚀 Launched Tokens</h1>
          <p>Sorted by Market Cap • {tokens.length} tokens</p>
        </div>

        {loading ? (
          <div className="loading"><div className="loader"></div><p>Loading...</p></div>
        ) : tokens.length === 0 ? (
          <div className="empty">
            <span style={{ fontSize: 48 }}>🪙</span>
            <p>No tokens launched yet</p>
            <a href="/presale/create" className="btn-cta">Create First Presale</a>
          </div>
        ) : (
          <>
            <div className="grid">
              {paginatedTokens.map((token, idx) => {
                const jup = token.jupiterData;
                const priceChange = jup?.stats24h?.priceChange || 0;
                const isRising = priceChange >= 0;
                const bondingProgress = jup?.bondingCurve || 0;
                
                return (
                  <div key={token.id} className="card" style={{ animationDelay: `${idx * 0.05}s` }}>
                    <div className="presale-badge">⭐ PRESALE</div>
                    
                    <div className="card-header">
                      <img 
                        src={jup?.icon || token.image_url || '/bags.gif'} 
                        alt={token.token_name}
                        className="token-img"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/bags.gif'; }}
                      />
                      <div className="token-info">
                        <div className="token-symbol">{jup?.symbol || token.token_symbol}</div>
                        <div className="token-name">{jup?.name || token.token_name}</div>
                      </div>
                    </div>

                    <div className="price-section">
                      <div className="price-left">
                        <div className="price">{formatPrice(jup?.usdPrice)}</div>
                        <div className={`change ${isRising ? 'up' : 'down'}`}>
                          {isRising ? '▲' : '▼'} {Math.abs(priceChange).toFixed(1)}%
                        </div>
                      </div>
                      <Sparkline data={sparklines[token.id] || []} color={isRising ? '#00ff88' : '#ff6b6b'} />
                    </div>

                    <div className="stats-row">
                      <div className="stat"><span className="label">MCap</span><span className="value mcap">{formatCompact(jup?.mcap)}</span></div>
                      <div className="stat"><span className="label">Liq</span><span className="value">{formatCompact(jup?.liquidity)}</span></div>
                      <div className="stat"><span className="label">Holders</span><span className="value">{jup?.holderCount || '-'}</span></div>
                    </div>

                    <div className="bonding-section">
                      <div className="bonding-bar">
                        <div className="bonding-fill" style={{ width: `${Math.min(bondingProgress, 100)}%` }}></div>
                      </div>
                      <div className="bonding-info">
                        <span>Bonding: {bondingProgress.toFixed(0)}%</span>
                        {jup?.graduatedPool && <span className="graduated">🎓</span>}
                      </div>
                    </div>

                    <div className="ca-row">
                      <span>CA:</span>
                      <a href={`https://solscan.io/token/${token.token_mint}`} target="_blank" rel="noopener noreferrer">{shortenAddress(token.token_mint)}</a>
                      <button onClick={() => navigator.clipboard.writeText(token.token_mint)}>📋</button>
                    </div>

                    <div className="actions">
                      <a href={`https://bags.fm/${token.token_mint}`} target="_blank" rel="noopener noreferrer" className="btn-sec">🛍️ BAGS</a>
                      <a href={`https://jup.ag/swap?outputMint=${token.token_mint}&inputMint=${SOL_MINT}`} target="_blank" rel="noopener noreferrer" className="btn-pri">⚡ Trade</a>
                    </div>
                  </div>
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
        .wrap { min-height: 100vh; background: linear-gradient(180deg, #0a0a0a 0%, #0d1117 100%); }
        .nav { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(10,10,10,0.95); backdrop-filter: blur(20px); position: sticky; top: 0; z-index: 100; }
        .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: #fff; }
        .nav-right { display: flex; align-items: center; gap: 6px; }
        .toggle { padding: 8px 14px; border-radius: 8px; text-decoration: none; color: #666; font-size: 13px; font-weight: 500; transition: all 0.2s; }
        .toggle:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .toggle.active { color: #00ff88; background: rgba(0,255,136,0.1); }
        .toggle.cta { background: #00ff88; color: #000; font-weight: 600; }
        .content { padding: 32px 24px; max-width: 1400px; margin: 0 auto; }
        .page-header { text-align: center; margin-bottom: 32px; }
        .page-header h1 { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
        .page-header p { color: #666; font-size: 14px; }
        .loading, .empty { text-align: center; padding: 80px 20px; }
        .loader { width: 40px; height: 40px; border: 3px solid rgba(0,255,136,0.1); border-top-color: #00ff88; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .btn-cta { display: inline-block; margin-top: 16px; padding: 12px 24px; background: #00ff88; color: #000; border-radius: 10px; font-weight: 700; text-decoration: none; }
        
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        @media (max-width: 1200px) { .grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 900px) { .grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
        
        .card { background: rgba(15,15,20,0.95); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 14px; position: relative; animation: fadeIn 0.4s ease forwards; opacity: 0; transition: all 0.3s; }
        .card:hover { border-color: rgba(0,255,136,0.4); transform: translateY(-4px); box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(0,255,136,0.1); }
        @keyframes fadeIn { to { opacity: 1; } }
        
        .presale-badge { position: absolute; top: 10px; right: 10px; background: linear-gradient(135deg, #f7931a, #ff6b00); color: #fff; font-size: 9px; font-weight: 700; padding: 3px 7px; border-radius: 5px; }
        .card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .token-img { width: 44px; height: 44px; border-radius: 10px; border: 2px solid rgba(255,255,255,0.1); object-fit: cover; }
        .token-info { flex: 1; min-width: 0; }
        .token-symbol { font-size: 15px; font-weight: 700; color: #fff; }
        .token-name { font-size: 11px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        .price-section { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px; margin-bottom: 10px; }
        .price { font-size: 16px; font-weight: 700; }
        .change { font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; margin-top: 2px; display: inline-block; }
        .change.up { background: rgba(0,255,136,0.15); color: #00ff88; }
        .change.down { background: rgba(255,100,100,0.15); color: #ff6b6b; }
        
        .stats-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
        .stat { text-align: center; flex: 1; }
        .stat .label { display: block; font-size: 9px; color: #555; text-transform: uppercase; }
        .stat .value { display: block; font-size: 12px; font-weight: 600; color: #fff; }
        .stat .value.mcap { color: #f7931a; }
        
        .bonding-section { margin-bottom: 10px; }
        .bonding-bar { height: 5px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; }
        .bonding-fill { height: 100%; background: linear-gradient(90deg, #00ff88, #00cc6a); border-radius: 3px; }
        .bonding-info { display: flex; justify-content: space-between; font-size: 10px; color: #555; margin-top: 4px; }
        .graduated { color: #a855f7; }
        
        .ca-row { display: flex; align-items: center; gap: 6px; font-size: 10px; margin-bottom: 10px; color: #444; }
        .ca-row a { color: #00ff88; text-decoration: none; font-family: monospace; }
        .ca-row button { background: none; border: none; cursor: pointer; font-size: 10px; opacity: 0.5; }
        .ca-row button:hover { opacity: 1; }
        
        .actions { display: flex; gap: 8px; }
        .btn-sec, .btn-pri { flex: 1; padding: 9px; text-align: center; border-radius: 8px; font-weight: 600; font-size: 11px; text-decoration: none; transition: all 0.2s; }
        .btn-sec { background: rgba(255,255,255,0.05); color: #fff; border: 1px solid rgba(255,255,255,0.1); }
        .btn-pri { background: linear-gradient(135deg, #00ff88, #00cc6a); color: #000; }
        .btn-pri:hover { transform: scale(1.02); }
        
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
