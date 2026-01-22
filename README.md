# 🚀 BAGS69 - Fair Launch Presale Platform

<div align="center">
  <img src="public/bags.gif" alt="BAGS69 Logo" width="120" />
  <h3>Fair Launch Presales on BAGS.FM</h3>
  <p>Create token presales with weighted fee sharing for creators and participants</p>
</div>

---

## ✨ Features

- **🎯 Fair Launch** - Creator gets 5%, participants share 95% weighted by contribution
- **⚡ Auto Launch** - Tokens launch automatically when presale fills
- **👥 Up to 68 Participants** - Choose 1-68 participant slots per presale
- **💰 Fee Sharing Forever** - All participants earn trading fees proportionally
- **🔒 Safe Refunds** - Full refunds if presale doesn't fill (no tax)
- **📊 Real-time Stats** - Live tracking of presales, participants, and fees

## 🏗️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: CSS-in-JS (styled-jsx)
- **Database**: PostgreSQL (Turso/Neon compatible)
- **Blockchain**: Solana (Web3.js + Wallet Adapter)
- **API Integration**: BAGS.FM API

## 📁 Project Structure

```
bags69-launchpad/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   ├── claim/         # Fee claiming endpoints
│   │   ├── presale/       # Presale CRUD endpoints
│   │   └── upload/        # Image upload
│   ├── claim/             # Claim fees page
│   ├── launched/          # Launched tokens page
│   ├── presale/           # Presale pages
│   │   ├── [id]/          # Presale detail page
│   │   └── create/        # Create presale page
│   ├── presales/          # All presales list
│   └── page.tsx           # Homepage
├── components/            # React components
│   └── WalletProvider.tsx # Solana wallet context
├── lib/                   # Core libraries
│   ├── constants.ts       # App configuration
│   ├── db.ts             # Database connection
│   ├── launch-presale.ts # Auto-launch logic
│   └── presale-store.ts  # Presale data layer
├── public/               # Static assets
│   ├── bags.gif          # Logo
│   └── docs.html         # Documentation page
└── README.md             # This file
```

## ⚙️ Configuration

### Fee Structure

| Config | Value | Description |
|--------|-------|-------------|
| Creator Share | 5% | Guaranteed fee share for presale creator |
| Participant Share | 95% | Split by SOL contribution weight |
| Withdrawal Tax | 5% | Tax on early withdrawals (active presales) |
| Launch Fee | 0.045 SOL | Non-refundable fee paid by creator |
| Min Contribution | 0.01 SOL | Minimum SOL per participant |
| Max Contribution | 0.1 SOL | Maximum SOL per participant |
| Max Participants | 68 | Maximum participants per presale |

### Example Fee Distribution

If a token generates **1 SOL** in trading fees with **0.5 SOL** total presale:

```
Creator (deployer):           5%  → 0.050 SOL
Participant A (0.10 SOL = 20%): 19% → 0.190 SOL  
Participant B (0.05 SOL = 10%): 9.5% → 0.095 SOL
Other participants (70%):      66.5% → 0.665 SOL
─────────────────────────────────────────────────
Total:                        100% → 1.000 SOL
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- PostgreSQL database
- Solana wallet with SOL

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/bags69-launchpad.git
cd bags69-launchpad

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env.local

# Edit .env.local with your values
nano .env.local

# Run development server
pnpm dev
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://...

# Solana RPC
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# BAGS API (required for fee claiming)
BAGS_BEARER_TOKEN=your_token

# Launcher wallet (required for auto-launch)
LAUNCHER_PRIVATE_KEY=your_private_key
```

## 📖 API Reference

### Presales

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/presale` | GET | List all presales |
| `/api/presale` | POST | Create new presale |
| `/api/presale/[id]` | GET | Get presale details |
| `/api/presale/[id]/join` | POST | Join a presale |
| `/api/presale/[id]/withdraw` | POST | Withdraw from presale |
| `/api/presale/[id]/launch` | POST | Manual launch trigger |
| `/api/presale/[id]/refund` | POST | Process refunds |
| `/api/presale/stats` | GET | Platform statistics |

### Fee Claiming

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/claim?wallet=xxx` | GET | Get claimable positions |
| `/api/claim` | POST | Create/submit claim transaction |

## 🔄 Presale Lifecycle

```
┌─────────────┐
│   CREATED   │ ← Creator pays 0.045 SOL launch fee
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   ACTIVE    │ ← Participants join (0.01-0.1 SOL each)
└──────┬──────┘
       │
   ┌───┴───┐
   │       │
   ▼       ▼
┌──────┐ ┌──────┐
│ FULL │ │EXPIRE│
└──┬───┘ └──┬───┘
   │        │
   ▼        ▼
┌──────┐ ┌──────┐
│LAUNCH│ │REFUND│ ← Full refunds (no tax)
└──┬───┘ └──────┘
   │
   ▼
┌─────────────┐
│  LAUNCHED   │ ← Token live on BAGS.FM!
└─────────────┘
       │
       ▼
   💰 Claim trading fees forever
```

## 🛡️ Security

- **Private Keys**: Never committed to git - use environment variables
- **Escrow System**: Participant funds held securely until launch
- **Withdrawal Tax**: 5% tax prevents manipulation during active presales
- **Refund Protection**: Full refunds if presale expires (no tax)

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🔗 Links

- **Website**: [bags69.fun](https://bags69.fun)
- **BAGS.FM**: [bags.fm](https://bags.fm)
- **Twitter**: [@bags69fun](https://x.com/bags69fun)
- **$69 Token**: [69FuNyPbdP3xezLyMFzBrnWMMCisKThNgUevXhBAGS69](https://bags.fm/69FuNyPbdP3xezLyMFzBrnWMMCisKThNgUevXhBAGS69)

---

<div align="center">
  <p>Built with 💚 on BAGS.FM</p>
</div>

---

## 📸 Logo Setup

Replace `public/bags.gif` with your own logo. The current file is a placeholder.
Recommended: Keep the file under 500KB for faster page loads.
