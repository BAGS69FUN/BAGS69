// lib/presale-db.ts
// Presale database for fair launch with fee sharing
// 69 wallets (68 participants + 1 creator), 5% creator allocation, 5% withdrawal tax

import * as fs from 'fs';
import * as path from 'path';
import { PRESALE_CONFIG, isValidDuration } from './constants';

// Database path
const PRESALE_DB_PATH = process.env.PRESALE_DB_PATH || 
  (process.env.RENDER ? '/data/presales.json' : './presales.json');

// Presale status enum
export type PresaleStatus = 'active' | 'launched' | 'failed' | 'refunding';

// Presale interface
export interface Presale {
  id: string; // Unique presale ID
  creator_wallet: string;
  
  // Token metadata
  token_name: string;
  token_symbol: string;
  description: string;
  image_url: string;
  twitter?: string;
  website?: string;
  
  // Presale config
  min_sol_per_wallet: number; // Minimum SOL to join (e.g., 0.1)
  max_sol_per_wallet: number; // Maximum SOL per wallet (e.g., 1)
  target_participants: number; // Target: 68 (+ creator = 69)
  duration_minutes: number; // Duration: 10, 20, or 30 minutes
  
  // Launch fee tracking
  launch_fee_paid: boolean;
  launch_fee_signature?: string;
  
  // Status
  status: PresaleStatus;
  created_at: string;
  expires_at: string;
  launched_at?: string;
  
  // Token info (set after launch)
  token_mint?: string;
  launch_signature?: string;
  meteora_config_key?: string;
  
  // Totals (calculated)
  total_sol: number;
  participant_count: number;
}

// Participant interface
export interface PresaleParticipant {
  id: string;
  presale_id: string;
  wallet: string;
  amount_sol: number;
  fee_share_bps: number; // Calculated based on contribution
  joined_at: string;
  tx_signature: string;
  confirmed: boolean;
  refunded: boolean;
  refund_signature?: string;
  
  // Withdrawal tracking (during active presale)
  withdrawn: boolean;
  withdraw_signature?: string;
  withdraw_tax_paid?: number; // 5% tax amount in SOL
}

interface PresaleDatabase {
  presales: Presale[];
  participants: PresaleParticipant[];
  lastPresaleNum: number;
}

let presaleDbCache: PresaleDatabase | null = null;
let saveTimeout: NodeJS.Timeout | null = null;

// Generate unique presale ID
function generatePresaleId(num: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `PS${String(num).padStart(4, '0')}${suffix}`;
}

// Load database
function loadPresaleDb(): PresaleDatabase {
  if (presaleDbCache) return presaleDbCache;
  
  console.log('[PresaleDB] Loading from:', PRESALE_DB_PATH);
  
  try {
    if (fs.existsSync(PRESALE_DB_PATH)) {
      const data = fs.readFileSync(PRESALE_DB_PATH, 'utf-8');
      presaleDbCache = JSON.parse(data);
      console.log('[PresaleDB] Loaded', presaleDbCache?.presales?.length || 0, 'presales');
      return presaleDbCache!;
    }
  } catch (e: any) {
    console.error('[PresaleDB] Error loading:', e.message);
  }
  
  presaleDbCache = { presales: [], participants: [], lastPresaleNum: 0 };
  console.log('[PresaleDB] Created new database');
  return presaleDbCache;
}

// Save database (debounced)
function savePresaleDb(): void {
  if (!presaleDbCache) return;
  
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const dir = path.dirname(PRESALE_DB_PATH);
      if (dir && dir !== '.' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(PRESALE_DB_PATH, JSON.stringify(presaleDbCache, null, 2));
      console.log('[PresaleDB] Saved');
    } catch (e: any) {
      console.error('[PresaleDB] Error saving:', e.message);
    }
  }, 500);
}

// Force save immediately
export function forceSavePresaleDb(): void {
  if (!presaleDbCache) return;
  try {
    const dir = path.dirname(PRESALE_DB_PATH);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PRESALE_DB_PATH, JSON.stringify(presaleDbCache, null, 2));
    console.log('[PresaleDB] Force saved');
  } catch (e: any) {
    console.error('[PresaleDB] Error force saving:', e.message);
  }
}

// ============ PRESALE CRUD ============

// Create a new presale
export async function createPresale(data: {
  creator_wallet: string;
  token_name: string;
  token_symbol: string;
  description: string;
  image_url: string;
  twitter?: string;
  website?: string;
  min_sol_per_wallet?: number;
  max_sol_per_wallet?: number;
  duration_minutes?: number;
  target_participants?: number; // 1-68, defaults to 68
  launch_fee_signature: string; // Required - must pay launch fee first
}): Promise<Presale> {
  const db = loadPresaleDb();
  
  // Validate duration
  const duration = data.duration_minutes || 30;
  if (!isValidDuration(duration)) {
    throw new Error(`Invalid duration. Must be one of: ${PRESALE_CONFIG.DURATION_OPTIONS.join(', ')} minutes`);
  }
  
  // Validate target participants (1-68)
  const targetParticipants = data.target_participants || PRESALE_CONFIG.DEFAULT_PARTICIPANTS;
  if (targetParticipants < PRESALE_CONFIG.MIN_PARTICIPANTS || targetParticipants > PRESALE_CONFIG.MAX_PARTICIPANTS) {
    throw new Error(`Target participants must be between ${PRESALE_CONFIG.MIN_PARTICIPANTS} and ${PRESALE_CONFIG.MAX_PARTICIPANTS}`);
  }
  
  // Launch fee signature is required
  if (!data.launch_fee_signature) {
    throw new Error('Launch fee payment signature required');
  }
  
  db.lastPresaleNum++;
  const id = generatePresaleId(db.lastPresaleNum);
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + duration * 60 * 1000);
  
  const presale: Presale = {
    id,
    creator_wallet: data.creator_wallet,
    token_name: data.token_name,
    token_symbol: data.token_symbol.toUpperCase().replace('$', ''),
    description: data.description,
    image_url: data.image_url,
    twitter: data.twitter,
    website: data.website,
    min_sol_per_wallet: data.min_sol_per_wallet || PRESALE_CONFIG.DEFAULT_MIN_SOL,
    max_sol_per_wallet: data.max_sol_per_wallet || PRESALE_CONFIG.DEFAULT_MAX_SOL,
    target_participants: targetParticipants,
    duration_minutes: duration,
    launch_fee_paid: true,
    launch_fee_signature: data.launch_fee_signature,
    status: 'active',
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    total_sol: 0,
    participant_count: 0,
  };
  
  db.presales.unshift(presale);
  savePresaleDb();
  
  console.log('[PresaleDB] Created presale:', id, presale.token_symbol, 'target:', targetParticipants);
  return presale;
}

// Get presale by ID
export async function getPresaleById(id: string): Promise<Presale | null> {
  const db = loadPresaleDb();
  return db.presales.find(p => p.id === id) || null;
}

// Get active presales
export async function getActivePresales(): Promise<Presale[]> {
  const db = loadPresaleDb();
  const now = new Date();
  
  return db.presales.filter(p => {
    if (p.status !== 'active') return false;
    // Check if expired
    if (new Date(p.expires_at) < now) return false;
    return true;
  });
}

// Get all presales (with pagination)
export async function getAllPresales(limit = 50, offset = 0): Promise<Presale[]> {
  const db = loadPresaleDb();
  return db.presales.slice(offset, offset + limit);
}

// Get launched presales only
export async function getLaunchedPresales(limit = 50, offset = 0): Promise<Presale[]> {
  const db = loadPresaleDb();
  return db.presales.filter(p => p.status === 'launched').slice(offset, offset + limit);
}

// Update presale status
export async function updatePresaleStatus(
  id: string, 
  status: PresaleStatus,
  additionalData?: Partial<Presale>
): Promise<Presale | null> {
  const db = loadPresaleDb();
  const presale = db.presales.find(p => p.id === id);
  
  if (!presale) return null;
  
  presale.status = status;
  if (additionalData) {
    Object.assign(presale, additionalData);
  }
  
  savePresaleDb();
  console.log('[PresaleDB] Updated presale status:', id, status);
  return presale;
}

// Update launch fee paid
export async function updateLaunchFeePaid(
  id: string,
  signature: string
): Promise<boolean> {
  const db = loadPresaleDb();
  const presale = db.presales.find(p => p.id === id);
  
  if (!presale) return false;
  
  presale.launch_fee_paid = true;
  presale.launch_fee_signature = signature;
  
  savePresaleDb();
  console.log('[PresaleDB] Updated launch fee paid:', id);
  return true;
}

// ============ PARTICIPANT CRUD ============

// Add participant to presale
export async function addParticipant(data: {
  presale_id: string;
  wallet: string;
  amount_sol: number;
  tx_signature: string;
}): Promise<PresaleParticipant | null> {
  const db = loadPresaleDb();
  const presale = db.presales.find(p => p.id === data.presale_id);
  
  if (!presale) {
    console.error('[PresaleDB] Presale not found:', data.presale_id);
    return null;
  }
  
  // Check if wallet already participated (and hasn't withdrawn)
  const existing = db.participants.find(
    p => p.presale_id === data.presale_id && p.wallet === data.wallet && !p.refunded && !p.withdrawn
  );
  if (existing) {
    console.error('[PresaleDB] Wallet already participated:', data.wallet);
    return null;
  }
  
  const participant: PresaleParticipant = {
    id: `${data.presale_id}-${Date.now()}`,
    presale_id: data.presale_id,
    wallet: data.wallet,
    amount_sol: data.amount_sol,
    fee_share_bps: 0, // Calculated on launch
    joined_at: new Date().toISOString(),
    tx_signature: data.tx_signature,
    confirmed: false,
    refunded: false,
    withdrawn: false,
  };
  
  db.participants.push(participant);
  savePresaleDb();
  
  console.log('[PresaleDB] Added participant:', data.wallet, 'to presale:', data.presale_id);
  return participant;
}

// Confirm participant deposit
export async function confirmParticipant(
  presale_id: string, 
  wallet: string
): Promise<{ participant: PresaleParticipant; presale: Presale } | null> {
  const db = loadPresaleDb();
  
  const participant = db.participants.find(
    p => p.presale_id === presale_id && p.wallet === wallet && !p.confirmed && !p.refunded && !p.withdrawn
  );
  
  if (!participant) {
    console.error('[PresaleDB] Participant not found or already confirmed');
    return null;
  }
  
  const presale = db.presales.find(p => p.id === presale_id);
  if (!presale) {
    console.error('[PresaleDB] Presale not found');
    return null;
  }
  
  // Confirm participant
  participant.confirmed = true;
  
  // Update presale totals
  presale.total_sol += participant.amount_sol;
  presale.participant_count++;
  
  savePresaleDb();
  
  console.log('[PresaleDB] Confirmed participant:', wallet, 
    '| Presale now has', presale.participant_count, 'participants,', presale.total_sol, 'SOL');
  
  return { participant, presale };
}

// Get participants for a presale
export async function getPresaleParticipants(presale_id: string): Promise<PresaleParticipant[]> {
  const db = loadPresaleDb();
  return db.participants.filter(p => p.presale_id === presale_id && p.confirmed && !p.refunded && !p.withdrawn);
}

// Get participant by wallet
export async function getParticipantByWallet(
  presale_id: string, 
  wallet: string
): Promise<PresaleParticipant | null> {
  const db = loadPresaleDb();
  return db.participants.find(
    p => p.presale_id === presale_id && p.wallet === wallet && !p.refunded && !p.withdrawn
  ) || null;
}

// Mark participant as refunded (for failed presales - no tax)
export async function markParticipantRefunded(
  presale_id: string,
  wallet: string,
  refund_signature: string
): Promise<boolean> {
  const db = loadPresaleDb();
  
  const participant = db.participants.find(
    p => p.presale_id === presale_id && p.wallet === wallet && !p.refunded && !p.withdrawn
  );
  
  if (!participant) return false;
  
  const presale = db.presales.find(p => p.id === presale_id);
  
  participant.refunded = true;
  participant.refund_signature = refund_signature;
  
  // Update presale totals if was confirmed
  if (participant.confirmed && presale) {
    presale.total_sol -= participant.amount_sol;
    presale.participant_count--;
  }
  
  savePresaleDb();
  console.log('[PresaleDB] Marked refunded:', wallet);
  return true;
}

// Mark participant as withdrawn (during active presale - with tax)
export async function markParticipantWithdrawn(
  presale_id: string,
  wallet: string,
  withdraw_signature: string,
  tax_paid: number
): Promise<boolean> {
  const db = loadPresaleDb();
  
  const participant = db.participants.find(
    p => p.presale_id === presale_id && p.wallet === wallet && !p.refunded && !p.withdrawn
  );
  
  if (!participant) return false;
  
  const presale = db.presales.find(p => p.id === presale_id);
  
  participant.withdrawn = true;
  participant.withdraw_signature = withdraw_signature;
  participant.withdraw_tax_paid = tax_paid;
  
  // Update presale totals if was confirmed
  if (participant.confirmed && presale) {
    presale.total_sol -= participant.amount_sol;
    presale.participant_count--;
  }
  
  savePresaleDb();
  console.log('[PresaleDB] Marked withdrawn with', tax_paid, 'SOL tax:', wallet);
  return true;
}

// Calculate fee shares for all participants (called before launch)
// Creator gets 5% (500 BPS) guaranteed, remaining 95% split proportionally
export async function calculateFeeShares(presale_id: string): Promise<{ wallet: string; bps: number }[]> {
  const db = loadPresaleDb();
  const presale = db.presales.find(p => p.id === presale_id);
  const participants = db.participants.filter(
    p => p.presale_id === presale_id && p.confirmed && !p.refunded && !p.withdrawn
  );
  
  if (!presale || participants.length === 0) return [];
  
  const totalSol = presale.total_sol;
  const feeShares: { wallet: string; bps: number }[] = [];
  
  // Creator gets 5% (500 BPS) guaranteed
  const creatorBps = PRESALE_CONFIG.CREATOR_ALLOCATION_BPS; // 500 = 5%
  let remainingBps = 10000 - creatorBps; // 9500 = 95% to distribute
  
  // Calculate shares proportional to SOL contributed
  let totalAssignedBps = 0;
  for (const p of participants) {
    const share = (p.amount_sol / totalSol) * remainingBps;
    const bps = Math.floor(share);
    p.fee_share_bps = bps;
    feeShares.push({ wallet: p.wallet, bps });
    totalAssignedBps += bps;
  }
  
  // Add creator with guaranteed share
  feeShares.unshift({ wallet: presale.creator_wallet, bps: creatorBps });
  totalAssignedBps += creatorBps;
  
  // Adjust for rounding (give remainder to last participant)
  if (totalAssignedBps < 10000 && feeShares.length > 1) {
    feeShares[feeShares.length - 1].bps += (10000 - totalAssignedBps);
  }
  
  savePresaleDb();
  
  console.log('[PresaleDB] Calculated fee shares for', feeShares.length, 'wallets');
  console.log('[PresaleDB] Creator:', presale.creator_wallet, 'gets', creatorBps, 'BPS (5%)');
  return feeShares;
}

// Check and update expired presales
export async function checkExpiredPresales(): Promise<Presale[]> {
  const db = loadPresaleDb();
  const now = new Date();
  const expired: Presale[] = [];
  
  for (const presale of db.presales) {
    if (presale.status === 'active' && new Date(presale.expires_at) < now) {
      presale.status = 'failed';
      expired.push(presale);
      console.log('[PresaleDB] Presale expired:', presale.id);
    }
  }
  
  if (expired.length > 0) {
    savePresaleDb();
  }
  
  return expired;
}

// Get presale stats
export async function getPresaleStats(): Promise<{
  total: number;
  active: number;
  launched: number;
  failed: number;
  total_sol: number;
}> {
  const db = loadPresaleDb();
  
  const launchedPresales = db.presales.filter(p => p.status === 'launched');
  const total_sol = launchedPresales.reduce((sum, p) => sum + (p.total_sol || 0), 0);
  
  return {
    total: db.presales.length,
    active: db.presales.filter(p => p.status === 'active').length,
    launched: launchedPresales.length,
    failed: db.presales.filter(p => p.status === 'failed').length,
    total_sol,
  };
}

// Check if presale is ready for auto-launch
export async function checkAutoLaunch(presale_id: string): Promise<boolean> {
  const presale = await getPresaleById(presale_id);
  if (!presale) return false;
  
  return presale.status === 'active' && 
         presale.participant_count >= presale.target_participants;
}
