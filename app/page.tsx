'use client';

import React, { useState, useEffect } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PRESALE_CONFIG } from '@/lib/constants';

interface Stats {
  total_presales: number;
  active_presales: number;
  launched_tokens: number;
  total_sol_raised: number;
}

// Generate mosaic colors
const generateColors = () => {
  const colors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
    '#dfe6e9', '#fd79a8', '#a29bfe', '#6c5ce7', '#00b894',
    '#e17055', '#fdcb6e', '#00cec9', '#0984e3', '#6c5ce7',
    '#e84393', '#00b894', '#00cec9', '#0984e3', '#6c5ce7',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

export default function HomePage() {
  const [stats, setStats] = useState<Stats>({
    total_presales: 0,
    active_presales: 0,
    launched_tokens: 0,
    total_sol_raised: 0,
  });
  const [mosaicColors, setMosaicColors] = useState<string[]>([]);

  useEffect(() => {
    // Generate mosaic colors
    const colors = Array.from({ length: 120 }, () => generateColors());
    setMosaicColors(colors);

    fetch('/api/presale/stats')
      .then(res => res.json())
      .then(data => {
        if (data.success) setStats(data.stats);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="wrap">
      {/* Animated Mosaic Background */}
      <div className="mosaic-bg">
        {mosaicColors.map((color, i) => (
          <div 
            key={i} 
            className="mosaic-tile"
            style={{ 
              background: `linear-gradient(145deg, ${color}40, ${color}20)`,
              animationDelay: `${Math.random() * 5}s`
            }}
          >
            <img src="/bags.gif" alt="" className="tile-logo" />
          </div>
        ))}
      </div>

      <header className="nav">
        <a href="/" className="brand">
          <img src="/bags.gif" alt="BAGS69" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <span style={{ fontWeight: 800, fontSize: 15 }}>BAGS69 <span style={{ color: '#00ff88' }}>$69</span></span>
        </a>
        <div className="nav-right">
          <a className="toggle active" href="/">Home</a>
          <a className="toggle" href="/presales">Presales</a>
          <a className="toggle" href="/launched">Launched</a>
          <a className="toggle" href="/claim">Claim Fees</a>
          <a className="toggle" href="/docs.html">Docs</a>
          <a className="toggle cta" href="/presale/create">Create</a>
          <WalletMultiButton className="wallet-btn" />
        </div>
      </header>

      <main className="hero">
        <div className="hero-content">
          {/* Logo */}
          <div className="hero-logo">
            <img src="/bags.gif" alt="BAGS69" />
            <div className="logo-glow"></div>
          </div>

          {/* Title */}
          <h1 className="headline">
            <span className="title-main">BAGS69</span>
          </h1>
          <p className="tagline">fair launch presales</p>

          {/* Badges */}
          <div className="badges">
            <span className="badge purple">powered by BAGS.FM</span>
            <a href="https://bags.fm/token/69FuNyPbdP3xezLyMFzBrnWMMCisKThNgUevXhBAGS69" target="_blank" rel="noopener noreferrer" className="badge green">$69</a>
          </div>

          {/* Social Links */}
          <div className="social-links">
            <a href="https://x.com/bags69fun" target="_blank" rel="noopener noreferrer" className="social-btn">𝕏</a>
            <a href="https://bags69.fun" target="_blank" rel="noopener noreferrer" className="social-btn">🌐</a>
            <a href="https://bags.fm" target="_blank" rel="noopener noreferrer" className="social-btn">🛍️</a>
          </div>

          {/* Token CA */}
          <div className="token-ca">
            <span>69FuNyPbdP3xezLyMFzBrnWMMCisKThNgUevXhBAGS69</span>
          </div>

          {/* CTA Button */}
          <a href="/presales" className="enter-btn">
            ENTER LAUNCHPAD
          </a>
        </div>

        {/* Stats Section */}
        <div className="stats-section">
          <div className="stat-item">
            <span className="stat-value">{stats.total_presales}</span>
            <span className="stat-label">Presales</span>
          </div>
          <div className="stat-item">
            <span className="stat-value green">{stats.active_presales}</span>
            <span className="stat-label">Active</span>
          </div>
          <div className="stat-item">
            <span className="stat-value purple">{stats.launched_tokens}</span>
            <span className="stat-label">Launched</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.total_sol_raised.toFixed(1)}</span>
            <span className="stat-label">SOL Raised</span>
          </div>
        </div>

        {/* Features */}
        <div className="features-row">
          <div className="feature">
            <span className="feature-icon">⚡</span>
            <span className="feature-text">1-68 Wallets</span>
          </div>
          <div className="feature">
            <span className="feature-icon">💰</span>
            <span className="feature-text">{PRESALE_CONFIG.CREATOR_ALLOCATION_BPS / 100}% Creator</span>
          </div>
          <div className="feature">
            <span className="feature-icon">🎯</span>
            <span className="feature-text">Auto Launch</span>
          </div>
          <div className="feature">
            <span className="feature-icon">🔄</span>
            <span className="feature-text">Fee Sharing</span>
          </div>
        </div>
      </main>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          background: #050505;
          position: relative;
          overflow: hidden;
        }
        
        .mosaic-bg {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 4px;
          padding: 4px;
          opacity: 0.4;
          z-index: 0;
        }
        
        .mosaic-tile {
          aspect-ratio: 1;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: pulse 4s ease-in-out infinite;
          transition: all 0.5s;
        }
        
        .mosaic-tile:hover {
          transform: scale(1.1);
          opacity: 1;
        }
        
        .tile-logo {
          width: 50%;
          height: 50%;
          object-fit: contain;
          opacity: 0.5;
          border-radius: 4px;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        
        .nav {
          position: relative;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          background: rgba(5, 5, 5, 0.8);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: #fff;
        }
        
        .nav-right {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .toggle {
          padding: 8px 14px;
          border-radius: 8px;
          text-decoration: none;
          color: #666;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }
        
        .toggle:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .toggle.active { color: #00ff88; background: rgba(0,255,136,0.1); }
        .toggle.cta { background: #00ff88; color: #000; font-weight: 600; }
        
        .hero {
          position: relative;
          z-index: 10;
          min-height: calc(100vh - 70px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
        }
        
        .hero-content {
          text-align: center;
          max-width: 600px;
        }
        
        .hero-logo {
          position: relative;
          width: 120px;
          height: 120px;
          margin: 0 auto 24px;
        }
        
        .hero-logo img {
          width: 100%;
          height: 100%;
          border-radius: 24px;
          border: 3px solid rgba(255,255,255,0.1);
          position: relative;
          z-index: 1;
        }
        
        .logo-glow {
          position: absolute;
          top: -10px;
          left: -10px;
          right: -10px;
          bottom: -10px;
          background: radial-gradient(circle, rgba(0,255,136,0.3) 0%, transparent 70%);
          border-radius: 32px;
          animation: glow 3s ease-in-out infinite;
        }
        
        @keyframes glow {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        
        .headline {
          margin-bottom: 8px;
        }
        
        .title-main {
          font-size: 64px;
          font-weight: 900;
          background: linear-gradient(135deg, #fff 0%, #00ff88 50%, #ff6b9d 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-size: 200% 200%;
          animation: gradient 5s ease infinite;
        }
        
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        
        .tagline {
          font-size: 18px;
          color: #888;
          margin-bottom: 24px;
        }
        
        .badges {
          display: flex;
          justify-content: center;
          gap: 12px;
          margin-bottom: 20px;
        }
        
        .badge {
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s;
        }
        
        .badge.purple {
          background: rgba(168, 85, 247, 0.2);
          color: #a855f7;
          border: 1px solid rgba(168, 85, 247, 0.3);
        }
        
        .badge.green {
          background: rgba(0, 255, 136, 0.2);
          color: #00ff88;
          border: 1px solid rgba(0, 255, 136, 0.3);
        }
        
        .badge:hover { transform: scale(1.05); }
        
        .social-links {
          display: flex;
          justify-content: center;
          gap: 12px;
          margin-bottom: 20px;
        }
        
        .social-btn {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: #fff;
          font-size: 18px;
          text-decoration: none;
          transition: all 0.2s;
        }
        
        .social-btn:hover {
          background: rgba(0,255,136,0.1);
          border-color: #00ff88;
          transform: translateY(-2px);
        }
        
        .token-ca {
          margin-bottom: 28px;
          padding: 8px 16px;
          background: rgba(255,255,255,0.03);
          border-radius: 8px;
          font-family: monospace;
          font-size: 11px;
          color: #666;
        }
        
        .enter-btn {
          display: inline-block;
          padding: 16px 48px;
          background: linear-gradient(135deg, #ff6b9d 0%, #ff8e53 100%);
          color: #fff;
          font-size: 16px;
          font-weight: 700;
          text-decoration: none;
          border-radius: 12px;
          transition: all 0.3s;
          box-shadow: 0 4px 20px rgba(255, 107, 157, 0.3);
        }
        
        .enter-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 30px rgba(255, 107, 157, 0.5);
        }
        
        .stats-section {
          display: flex;
          justify-content: center;
          gap: 32px;
          margin-top: 48px;
          padding: 20px 40px;
          background: rgba(255,255,255,0.02);
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.05);
        }
        
        .stat-item {
          text-align: center;
        }
        
        .stat-value {
          display: block;
          font-size: 28px;
          font-weight: 800;
          color: #fff;
        }
        
        .stat-value.green { color: #00ff88; }
        .stat-value.purple { color: #a855f7; }
        
        .stat-label {
          font-size: 11px;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        .features-row {
          display: flex;
          justify-content: center;
          gap: 24px;
          margin-top: 32px;
          flex-wrap: wrap;
        }
        
        .feature {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(255,255,255,0.03);
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.06);
        }
        
        .feature-icon { font-size: 16px; }
        .feature-text { font-size: 13px; color: #888; font-weight: 500; }
        
        @media (max-width: 768px) {
          .mosaic-bg { grid-template-columns: repeat(6, 1fr); }
          .title-main { font-size: 42px; }
          .stats-section { flex-wrap: wrap; gap: 20px; }
          .features-row { gap: 12px; }
        }
      `}</style>
      
      <style jsx global>{`
        .wallet-btn {
          background: rgba(0,255,136,0.1) !important;
          border: 1px solid rgba(0,255,136,0.3) !important;
          border-radius: 8px !important;
          color: #00ff88 !important;
          font-weight: 600 !important;
          font-size: 12px !important;
        }
      `}</style>
    </div>
  );
}
