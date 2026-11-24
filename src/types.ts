export type RoundPhase = 'BETTING' | 'FLYING' | 'CRASHED';

export interface PublicUser {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  balance: number;
  hasDeposited: boolean;
  hasDoubleBonusPromo?: boolean;
  totalBonus?: number;
  createdAt: string;
}

export interface LiveBetItem {
  id: string;
  userId: string;
  userName: string;
  isOwn: boolean;
  panel: 1 | 2;
  stake: number;
  autoCashout: number | null;
  status: 'ACTIVE' | 'CASHED_OUT' | 'LOST';
  cashoutMultiplier: number | null;
  payout: number;
}

export interface QueuedBetItem {
  id: string;
  panel: 1 | 2;
  stake: number;
  autoCashout: number | null;
}

export interface GameSnapshot {
  phase: RoundPhase;
  roundNumber: number;
  roundCode: string;
  serverSeedHash: string;
  clientSeed: string;
  serverSeed: string | null;
  crashPoint: number | null;
  multiplier: number;
  phaseStartedAt: number;
  bettingEndsAt: number;
  serverTime: number;
  onlinePlayers: number;
  bets: LiveBetItem[];
  myQueuedBets: QueuedBetItem[];
}

export interface RoundHistoryItem {
  id: number;
  roundCode: string;
  crashPoint: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  crashedAt: string;
}

export interface MyBetHistoryItem {
  id: string;
  roundCode: string;
  crashPoint: number;
  panel: 1 | 2;
  stake: number;
  cashoutMultiplier: number | null;
  payout: number;
  status: 'CASHED_OUT' | 'LOST';
  createdAt: string;
}

export interface TopWinItem {
  id: string;
  userName: string;
  roundCode: string;
  stake: number;
  cashoutMultiplier: number | null;
  payout: number;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'BONUS';
  method: string;
  phone_or_ref: string;
  amount: number;
  reference: string;
  status: string;
  checkout_request_id?: string | null;
  result_desc?: string | null;
  created_at: string;
}

export interface DarajaStatus {
  configured: boolean;
  env: 'sandbox' | 'production';
  missingSecrets: string[];
}

export interface DepositUpdateEvent {
  status: 'COMPLETED' | 'FAILED';
  checkoutRequestId: string;
  bonusAwarded?: number;
  transaction?: WalletTransaction;
  user?: PublicUser;
}

export interface ChatMessageItem {
  id: string;
  userName: string;
  message: string;
  isSystem: boolean;
  createdAt: string;
}

export interface PlayerStats {
  totalBets: number;
  wins: number;
  biggestMultiplier: number;
  biggestPayout: number;
  totalWagered: number;
  totalWon: number;
}
