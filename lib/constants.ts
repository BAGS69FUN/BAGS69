/**
 * BAGS69 Presale Launchpad - Configuration
 * =========================================
 * All wallet addresses and settings for the presale platform.
 * Sensitive values should be set via environment variables.
 */

// ============================================
// TOKEN CONFIGURATION
// ============================================

/** Platform token mint address ($69) */
export const PLATFORM_TOKEN_MINT = 
  process.env.NEXT_PUBLIC_PLATFORM_TOKEN_MINT || 
  '69FuNyPbdP3xezLyMFzBrnWMMCisKThNgUevXhBAGS69';

/** Treasury wallet - receives platform fees */
export const TREASURY_WALLET = 
  process.env.NEXT_PUBLIC_TREASURY_WALLET || 
  'Xv2hK594scUGZs9V7tqhavkfcUyEBHfUt7RNC29HHyN';

// Common Solana token mints
export const MINT_SOL = 'So11111111111111111111111111111111111111112';
export const MINT_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Legacy export for backwards compatibility
export const METSUMI_MINT = PLATFORM_TOKEN_MINT;
export const TREASURY = TREASURY_WALLET;

// ============================================
// PRESALE WALLET CONFIGURATION
// ============================================

/** 
 * Tax wallet - receives 5% withdrawal tax during active presales 
 * Set NEXT_PUBLIC_TAX_WALLET env var to override
 */
export const TAX_WALLET = 
  process.env.NEXT_PUBLIC_TAX_WALLET || 
  'DtDrwr7qXqWoXikXndmENBZBjjagMjEt1wnZBTVPPser';

/** 
 * Launcher wallet - signs automatic token deployment transactions
 * Public key only - private key must be set in LAUNCHER_PRIVATE_KEY env var
 * Set NEXT_PUBLIC_LAUNCHER_WALLET env var to override
 */
export const LAUNCHER_WALLET = 
  process.env.NEXT_PUBLIC_LAUNCHER_WALLET || 
  '7rj696ScXmLPhicac53svqPqTkV7D8xHoqFozhY9HV6y';

/** 
 * Escrow wallet - holds participant funds during active presales
 * Defaults to launcher wallet if not specified
 */
export const ESCROW_WALLET = 
  process.env.NEXT_PUBLIC_ESCROW_WALLET || 
  LAUNCHER_WALLET;

/** Partner wallet for BAGS.FM fee sharing */
export const PARTNER_WALLET = LAUNCHER_WALLET;

/** 
 * Partner config key for BAGS.FM integration
 * This enables the 25% partner fee share from BAGS.FM
 */
export const PARTNER_CONFIG_KEY = 
  process.env.NEXT_PUBLIC_PARTNER_CONFIG_KEY || 
  'CcBd9g98VKcbfHke7FzQNPypAUZg7waDJ1VXTPzEvY5C';

// ============================================
// PRESALE CONFIGURATION
// ============================================

export const PRESALE_CONFIG = {
  // ---- Participant Limits ----
  /** Minimum participants allowed (creator can choose 1-68) */
  MIN_PARTICIPANTS: 1,
  /** Maximum participants allowed per presale */
  MAX_PARTICIPANTS: 68,
  /** Total wallets = participants + creator = 69 max (nice!) */
  MAX_WALLETS: 69,

  // ---- Fee Distribution (in basis points) ----
  /** Creator's guaranteed fee share: 5% */
  CREATOR_ALLOCATION_BPS: 500,
  /** Participants' fee share: 95% (split by contribution weight) */
  PARTICIPANT_ALLOCATION_BPS: 9500,
  /** Withdrawal tax during active presale: 5% */
  WITHDRAWAL_TAX_BPS: 500,

  // ---- Timing ----
  /** Available presale duration options (in minutes) */
  DURATION_OPTIONS: [10, 20, 30] as const,

  // ---- Fees ----
  /** Launch fee paid by creator (non-refundable) */
  LAUNCH_FEE_SOL: 0.045,

  // ---- Contribution Limits ----
  /** Minimum SOL contribution per participant */
  DEFAULT_MIN_SOL: 0.01,
  /** Maximum SOL contribution per participant */
  DEFAULT_MAX_SOL: 0.1,

  // ---- Defaults ----
  /** Default target participant count */
  DEFAULT_PARTICIPANTS: 68,
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Validate if a duration is one of the allowed options
 */
export function isValidDuration(minutes: number): boolean {
  return PRESALE_CONFIG.DURATION_OPTIONS.includes(minutes as 10 | 20 | 30);
}

/**
 * Calculate withdrawal tax for early withdrawals during active presale
 * @param amountSol - Amount being withdrawn
 * @returns Object with taxAmount and returnAmount
 */
export function calculateWithdrawalTax(amountSol: number): {
  taxAmount: number;
  returnAmount: number;
} {
  const taxAmount = amountSol * (PRESALE_CONFIG.WITHDRAWAL_TAX_BPS / 10000);
  const returnAmount = amountSol - taxAmount;
  return { taxAmount, returnAmount };
}

/**
 * Get the fee share split between creator and participants
 */
export function calculateFeeShares(): {
  creatorBps: number;
  participantsBps: number;
  creatorPercent: number;
  participantsPercent: number;
} {
  const creatorBps = PRESALE_CONFIG.CREATOR_ALLOCATION_BPS;
  const participantsBps = PRESALE_CONFIG.PARTICIPANT_ALLOCATION_BPS;
  return {
    creatorBps,
    participantsBps,
    creatorPercent: creatorBps / 100,
    participantsPercent: participantsBps / 100,
  };
}

/**
 * Calculate a participant's weighted share of the participant fee pool
 * @param contributionSol - The participant's SOL contribution
 * @param totalPoolSol - Total SOL in the participant pool
 * @returns The participant's share in basis points (0-9500)
 */
export function calculateParticipantShare(
  contributionSol: number,
  totalPoolSol: number
): number {
  if (totalPoolSol <= 0) return 0;
  const weight = contributionSol / totalPoolSol;
  return Math.floor(weight * PRESALE_CONFIG.PARTICIPANT_ALLOCATION_BPS);
}

/**
 * Format a basis points value as a percentage string
 */
export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
