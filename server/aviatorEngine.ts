import crypto from 'crypto';
import type { WebSocket } from 'ws';
import { db, toPublicUser, type RoundRow, type UserRow } from './db.ts';

export type RoundPhase = 'BETTING' | 'FLYING' | 'CRASHED';

export interface ActiveBet {
  id: string;
  userId: string;
  userName: string;
  panel: 1 | 2;
  stake: number;
  autoCashout: number | null;
  status: 'ACTIVE' | 'CASHED_OUT' | 'LOST';
  cashoutMultiplier: number | null;
  payout: number;
  createdAt: string;
  isSimulated?: boolean;
}

export interface ArenaChatMessage {
  id: string;
  userName: string;
  message: string;
  isSystem: boolean;
  createdAt: string;
}

export interface QueuedBet {
  id: string;
  userId: string;
  userName: string;
  panel: 1 | 2;
  stake: number;
  autoCashout: number | null;
  createdAt: string;
}

export interface PublicRoundHistoryItem {
  id: number;
  roundCode: string;
  crashPoint: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  crashedAt: string;
}

const BETTING_DURATION_MS = 5500;
const CRASHED_DURATION_MS = 3200;
const TICK_INTERVAL_MS = 50;
const GROWTH_RATE = 0.068; // Exponential curve: M(t) = e^(0.068 * t)

export const MIN_STAKE_KES = 10;
export const MAX_STAKE_KES = 100000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ArenaLeaderboardWin {
  id: string;
  userName: string;
  roundCode: string;
  stake: number;
  cashoutMultiplier: number;
  payout: number;
  createdAt: string;
}

function maskDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] || 'Player';
  const maskedFirst = first.length <= 2 ? `${first}***` : `${first.slice(0, 2)}***${first.slice(-1)}`;
  if (parts.length > 1 && parts[1]) {
    return `${maskedFirst} ${parts[1][0].toUpperCase()}.`;
  }
  return maskedFirst;
}

/**
 * Provably-fair crash multiplier generator.
 * Uses HMAC-SHA256(serverSeed, clientSeed + ":" + roundNumber) with a 3% house edge
 * and ~3% instant crash at 1.00x, matching real Aviator crash curve mathematics.
 */
function generateCrashPoint(serverSeed: string, clientSeed: string, roundNumber: number): number {
  const hmac = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${roundNumber}`)
    .digest('hex');

  const h = parseInt(hmac.slice(0, 13), 16); // 52-bit integer
  if (h % 33 === 0) {
    return 1.0;
  }
  const e = 2 ** 52;
  const raw = Math.floor((100 * e - h) / (e - h)) / 100;
  return Math.min(1000.0, Math.max(1.01, raw));
}

const PILOT_FIRST_NAMES = [
  'Brian', 'Faith', 'Kevin', 'Wanjiku', 'Dennis', 'Sharon', 'Otieno', 'Mutua',
  'Chebet', 'James', 'Njeri', 'Kiprop', 'Abdul', 'Rose', 'Alex', 'Sarah',
  'George', 'Mary', 'Victor', 'Peter', 'Lilian', 'John', 'Caleb', 'David',
  'Mercy', 'Collins', 'Esther', 'Samuel', 'Diana', 'Joseph', 'Grace', 'Patrick',
  'Beatrice', 'Eric', 'Vivian', 'Kelvin', 'Purity', 'Ian', 'Cynthia', 'Stephen',
  'Brenda', 'Moses', 'Linet', 'Titus', 'Kendi', 'Salim', 'Amina', 'Hassan',
  'Zainab', 'Benson', 'Winnie', 'Duncan', 'Phoebe', 'Gideon', 'Sylvia', 'Humphrey',
  'Christine', 'Kennedy', 'Marion', 'Boniface', 'Tabitha', 'Elijah', 'Naomi', 'Fredrick',
  'Carol', 'Ronald', 'Miriam', 'Raymond', 'Joyce', 'Isaac', 'Judith', 'Edwin',
  'Nelson', 'Millicent', 'Kiptoo', 'Nelly', 'Mwangi', 'Rashid', 'Khadija', 'Bramwell',
];

const PILOT_SURNAME_INITIALS = [
  'A', 'B', 'C', 'D', 'E', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'W', 'Y', 'Z',
];

const PILOT_HANDLES = [
  'NairobiJet', '254Pilot', 'MombasaFly', 'EldyAce', 'KisumuSky', 'RiftRunner',
  'NakuruPro', 'ThikaFlyer', 'WestyBoss', 'NyaliWing', 'KarenJet', 'LamuFly',
  'MeruKing', 'MalindiAce', 'KiambuPro', 'MachakosFly', 'KerichoSky', 'BungomaJet',
  'KajiadoAce', 'NanyukiFly', 'MpesaKing', 'SkyHunter', 'SafariJet', 'SavannahAce',
];

export function generateRandomPilotName(used?: Set<string>): string {
  for (let attempt = 0; attempt < 25; attempt++) {
    let candidate: string;
    if (Math.random() < 0.72) {
      const first = PILOT_FIRST_NAMES[Math.floor(Math.random() * PILOT_FIRST_NAMES.length)];
      const initial = PILOT_SURNAME_INITIALS[Math.floor(Math.random() * PILOT_SURNAME_INITIALS.length)];
      candidate = `${first} ${initial}.`;
    } else {
      const handle = PILOT_HANDLES[Math.floor(Math.random() * PILOT_HANDLES.length)];
      const suffix = Math.random() < 0.65 ? String(Math.floor(10 + Math.random() * 89)) : '';
      candidate = `${handle}${suffix}`;
    }
    if (!used || !used.has(candidate)) {
      used?.add(candidate);
      return candidate;
    }
  }
  const fallback = `${PILOT_FIRST_NAMES[Math.floor(Math.random() * PILOT_FIRST_NAMES.length)]} ${Math.floor(10 + Math.random() * 89)}`;
  used?.add(fallback);
  return fallback;
}

const ARENA_BOT_STAKES = [
  20, 50, 100, 100, 150, 200, 200, 300, 500, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000,
];

const HIGH_CRASH_CHAT_LINES = [
  'Ndege imepaa sana leo! 🚀',
  'Cashed out just in time 😅',
  'Patience pays in Aviator 🔥',
  'Mambo iko sawa kabisa 💰',
  'Who else caught that high multiplier?',
  'Next round twende 5x+ pilots!',
];

const LOW_CRASH_CHAT_LINES = [
  'Waaah that was quick 😂',
  'Hii ilikuwa ya haraka sana, next round!',
  'Always set auto cashout on Panel 1 👀',
  'Going again on next takeoff ✈️',
];

const AMBIENT_CHAT_LINES = [
  'Targeting 2.50x on Panel 1, letting Panel 2 ride 🚀',
  'Hii round naona ikipaa mbali leo',
  'Always lock profit early guys 💰',
  'Nani ameshika 5x+ hapa?',
  'M-Pesa deposit entered in seconds, tucheze!',
  'Auto cashout at 1.85x just saved me 😂',
  'Waaah Nairobi pilots tuko wengi leo 🔥',
  'Going big on next takeoff ✈️',
  'Patience pays in Aviator, never chase',
  'Safi sana! Just locked in a nice win',
  'Leo ni siku ya 10x+, I can feel it!',
  'Kama kawaida, slow and steady wins',
  'That flight curve looking super clean 👀',
  'Panel 1 safe, Panel 2 moonshot 💪',
  'Karibu niachwe hapo, pheew 😅',
  'Good luck everyone on this flight!',
  'Just withdrew my profit to M-Pesa ✅',
  'Wait for two low rounds then strike 🎯',
  'Who is flying Panel 1 and 2 together?',
  '1000 bob on 3x is clean money 💸',
  'Easy 2.20x cashout, we move!',
  'Big shoutout to everyone winning tonight 🙌',
  'Holding steady for 4.00x this flight',
  'Let it fly high! 🚀🔥',
];

export class AviatorEngine {
  private clients = new Map<WebSocket, { userId: string | null }>();
  private phase: RoundPhase = 'BETTING';
  private roundNumber = 1;
  private roundCode = '';
  private serverSeed = '';
  private serverSeedHash = '';
  private clientSeed = '';
  private crashPoint = 1.0;
  private currentMultiplier = 1.0;
  private phaseStartedAt = Date.now();
  private bettingEndsAt = Date.now() + BETTING_DURATION_MS;
  private activeBets: ActiveBet[] = [];
  private queuedBets: QueuedBet[] = [];
  private tickTimer: NodeJS.Timeout | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  private simTimers: NodeJS.Timeout[] = [];
  private ambientChatTimer: NodeJS.Timeout | null = null;
  private onlineBaseline = 560 + Math.floor(Math.random() * 190);
  private announcedBigWinThisRound = false;
  private recentArenaChat: ArenaChatMessage[] = [];
  private liveLeaderboardWins: ArenaLeaderboardWin[] = [];

  constructor() {
    const lastRound = db
      .prepare('SELECT id FROM rounds ORDER BY id DESC LIMIT 1')
      .get() as { id: number } | undefined;
    this.roundNumber = (lastRound?.id ?? 0) + 1;
    this.seedInitialHistoryIfEmpty();
    this.seedInitialArenaChat();
    this.seedInitialLeaderboardWins();
    this.scheduleNextAmbientChat();
    this.startBettingPhase();
  }

  private seedInitialHistoryIfEmpty() {
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM rounds').get() as { cnt: number };
    if (countRow.cnt > 0) return;

    const insert = db.prepare(`
      INSERT INTO rounds (round_code, crash_point, server_seed, server_seed_hash, client_seed, started_at, crashed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const seedRound = db.transaction(() => {
      const now = Date.now();
      for (let i = 1; i <= 14; i++) {
        const sSeed = crypto.randomBytes(32).toString('hex');
        const sHash = crypto.createHash('sha256').update(sSeed).digest('hex');
        const cSeed = `betkenya254-r${i}`;
        const crash = generateCrashPoint(sSeed, cSeed, i);
        const ts = new Date(now - (15 - i) * 20000).toISOString();
        insert.run(`BK-${1000 + i}`, crash, sSeed, sHash, cSeed, ts, ts);
      }
    });
    seedRound();
    this.roundNumber = 15;
  }

  public registerClient(ws: WebSocket, userId: string | null) {
    this.clients.set(ws, { userId });
    this.sendSnapshot(ws, userId);
  }

  public updateClientAuth(ws: WebSocket, userId: string | null) {
    const entry = this.clients.get(ws);
    if (entry) {
      entry.userId = userId;
      this.sendSnapshot(ws, userId);
    }
  }

  public unregisterClient(ws: WebSocket) {
    this.clients.delete(ws);
  }

  private sendToSocket(ws: WebSocket, event: string, data: unknown) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ event, data }));
    }
  }

  private broadcast(event: string, data: unknown) {
    const payload = JSON.stringify({ event, data });
    for (const [ws] of this.clients) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }

  public notifyUserBalance(userId: string) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
    if (!user) return;
    const publicUser = toPublicUser(user);
    for (const [ws, meta] of this.clients) {
      if (meta.userId === userId) {
        this.sendToSocket(ws, 'user:balance', publicUser);
      }
    }
  }

  public broadcastEvent(event: string, data: unknown) {
    this.broadcast(event, data);
  }

  public pushUserEvent(userId: string, event: string, data: unknown) {
    for (const [ws, meta] of this.clients) {
      if (meta.userId === userId) {
        this.sendToSocket(ws, event, data);
      }
    }
  }

  public getPublicState(userId: string | null) {
    return {
      phase: this.phase,
      roundNumber: this.roundNumber,
      roundCode: this.roundCode,
      serverSeedHash: this.serverSeedHash,
      clientSeed: this.clientSeed,
      serverSeed: this.phase === 'CRASHED' ? this.serverSeed : null,
      crashPoint: this.phase === 'CRASHED' ? this.crashPoint : null,
      multiplier: this.currentMultiplier,
      phaseStartedAt: this.phaseStartedAt,
      bettingEndsAt: this.bettingEndsAt,
      serverTime: Date.now(),
      onlinePlayers: this.onlineBaseline + this.clients.size,
      bets: this.activeBets.map((b) => ({
        id: b.id,
        userId: b.userId,
        userName: maskDisplayName(b.userName),
        isOwn: !b.isSimulated && userId ? b.userId === userId : false,
        panel: b.panel,
        stake: b.stake,
        autoCashout: b.autoCashout,
        status: b.status,
        cashoutMultiplier: b.cashoutMultiplier,
        payout: b.payout,
      })),
      myQueuedBets: userId
        ? this.queuedBets
            .filter((q) => q.userId === userId)
            .map((q) => ({
              id: q.id,
              panel: q.panel,
              stake: q.stake,
              autoCashout: q.autoCashout,
            }))
        : [],
    };
  }

  private sendSnapshot(ws: WebSocket, userId: string | null) {
    this.sendToSocket(ws, 'game:snapshot', this.getPublicState(userId));
  }

  private broadcastBets() {
    for (const [ws, meta] of this.clients) {
      this.sendToSocket(ws, 'game:bets', {
        bets: this.activeBets.map((b) => ({
          id: b.id,
          userId: b.userId,
          userName: maskDisplayName(b.userName),
          isOwn: !b.isSimulated && meta.userId ? b.userId === meta.userId : false,
          panel: b.panel,
          stake: b.stake,
          autoCashout: b.autoCashout,
          status: b.status,
          cashoutMultiplier: b.cashoutMultiplier,
          payout: b.payout,
        })),
        myQueuedBets: meta.userId
          ? this.queuedBets
              .filter((q) => q.userId === meta.userId)
              .map((q) => ({
                id: q.id,
                panel: q.panel,
                stake: q.stake,
                autoCashout: q.autoCashout,
              }))
          : [],
      });
    }
  }

  private clearSimTimers() {
    for (const t of this.simTimers) {
      clearTimeout(t);
    }
    this.simTimers = [];
  }

  private seedInitialArenaChat() {
    const now = Date.now();
    const used = new Set<string>();
    const initialLines = [
      'Caught 4.80x on Panel 1, rolling profit to next flight 🔥',
      'Always lock profit early guys 💰',
      'Waaah Nairobi pilots tuko wengi leo 🔥',
      'Panel 1 safe, Panel 2 moonshot 💪',
      'Good luck pilots! ✈️',
    ];
    this.recentArenaChat = initialLines.map((message, idx) => ({
      id: crypto.randomUUID(),
      userName: generateRandomPilotName(used),
      message,
      isSystem: false,
      createdAt: new Date(now - (initialLines.length - idx) * 45000).toISOString(),
    }));
  }

  private seedInitialLeaderboardWins() {
    const used = new Set<string>();
    const stakes = [100, 200, 300, 500, 750, 1000, 1500, 2000, 2500, 3500, 5000, 8000, 10000, 15000];
    const now = Date.now();
    this.liveLeaderboardWins = Array.from({ length: 24 }, (_, idx) => {
      const rawName = generateRandomPilotName(used);
      const stake = stakes[Math.floor(Math.random() * stakes.length)];
      const tier = Math.random();
      const mult =
        tier < 0.4
          ? round2(6 + Math.random() * 24)
          : tier < 0.78
          ? round2(30 + Math.random() * 95)
          : round2(130 + Math.random() * 320);
      const payout = round2(stake * mult);
      const roundOffset = Math.max(1001, this.roundNumber + 1000 - Math.floor(Math.random() * 140));
      return {
        id: `lb-init-${crypto.randomUUID()}`,
        userName: maskDisplayName(rawName),
        roundCode: `BK-${roundOffset}`,
        stake,
        cashoutMultiplier: mult,
        payout,
        createdAt: new Date(now - (idx + 1) * 140000).toISOString(),
      };
    });
  }

  public getArenaLeaderboard(): ArenaLeaderboardWin[] {
    return this.liveLeaderboardWins;
  }

  private scheduleNextAmbientChat() {
    if (this.ambientChatTimer) clearTimeout(this.ambientChatTimer);
    const delay = 4500 + Math.floor(Math.random() * 5000); // every 4.5s – 9.5s
    this.ambientChatTimer = setTimeout(() => {
      const recentTexts = new Set(this.recentArenaChat.slice(-8).map((m) => m.message));
      const available = AMBIENT_CHAT_LINES.filter((line) => !recentTexts.has(line));
      const pool = available.length > 0 ? available : AMBIENT_CHAT_LINES;
      const line = pool[Math.floor(Math.random() * pool.length)];
      this.pushArenaChat({
        userName: generateRandomPilotName(),
        message: line,
        isSystem: false,
      });
      this.scheduleNextAmbientChat();
    }, delay);
  }

  private pushArenaChat(msg: Omit<ArenaChatMessage, 'id' | 'createdAt'>) {
    const payload: ArenaChatMessage = {
      id: crypto.randomUUID(),
      userName: msg.userName,
      message: msg.message,
      isSystem: msg.isSystem,
      createdAt: new Date().toISOString(),
    };
    this.recentArenaChat = [...this.recentArenaChat.slice(-24), payload];
    this.broadcast('chat:message', payload);
  }

  public getArenaChat(): ArenaChatMessage[] {
    return this.recentArenaChat;
  }

  private buildSimulatedBet(name: string): ActiveBet {
    const stake = ARENA_BOT_STAKES[Math.floor(Math.random() * ARENA_BOT_STAKES.length)];
    const r = Math.random();
    let targetCashout: number;
    if (r < 0.24) {
      targetCashout = round2(1.15 + Math.random() * 0.5);
    } else if (r < 0.66) {
      targetCashout = round2(1.65 + Math.random() * 1.85);
    } else if (r < 0.9) {
      targetCashout = round2(3.5 + Math.random() * 6.0);
    } else {
      targetCashout = round2(10.0 + Math.random() * 45.0);
    }
    return {
      id: `sim-${crypto.randomUUID()}`,
      userId: `sim-${name}`,
      userName: name,
      panel: Math.random() < 0.72 ? 1 : 2,
      stake,
      autoCashout: targetCashout,
      status: 'ACTIVE',
      cashoutMultiplier: null,
      payout: 0,
      createdAt: new Date().toISOString(),
      isSimulated: true,
    };
  }

  private scheduleSimulatedRoundBets() {
    const totalCount = 26 + Math.floor(Math.random() * 15); // 26–40 active players per round
    const used = new Set(this.activeBets.map((b) => b.userName));
    const chosenNames = Array.from({ length: totalCount }, () => generateRandomPilotName(used));
    const waveDelays = [350, 1150, 2100, 3200, 4250];
    const perWave = Math.ceil(chosenNames.length / waveDelays.length);

    waveDelays.forEach((delay, waveIdx) => {
      const slice = chosenNames.slice(waveIdx * perWave, (waveIdx + 1) * perWave);
      if (slice.length === 0) return;
      const t = setTimeout(() => {
        if (this.phase !== 'BETTING') return;
        for (const name of slice) {
          this.activeBets.push(this.buildSimulatedBet(name));
        }
        this.broadcastBets();
      }, delay);
      this.simTimers.push(t);
    });
  }

  private startBettingPhase() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.clearSimTimers();

    this.phase = 'BETTING';
    this.roundCode = `BK-${1000 + this.roundNumber}`;
    this.serverSeed = crypto.randomBytes(32).toString('hex');
    this.serverSeedHash = crypto.createHash('sha256').update(this.serverSeed).digest('hex');
    this.clientSeed = `betkenya254-r${this.roundNumber}`;
    this.crashPoint = generateCrashPoint(this.serverSeed, this.clientSeed, this.roundNumber);
    this.currentMultiplier = 1.0;
    this.phaseStartedAt = Date.now();
    this.bettingEndsAt = this.phaseStartedAt + BETTING_DURATION_MS;
    this.activeBets = [];
    this.announcedBigWinThisRound = false;

    const delta = Math.floor(Math.random() * 26) - 12;
    this.onlineBaseline = Math.min(960, Math.max(430, this.onlineBaseline + delta));

    // Promote queued bets into active bets for this new round
    if (this.queuedBets.length > 0) {
      const toPromote = [...this.queuedBets];
      this.queuedBets = [];
      for (const q of toPromote) {
        const alreadyPlaced = this.activeBets.some(
          (b) => !b.isSimulated && b.userId === q.userId && b.panel === q.panel,
        );
        if (!alreadyPlaced) {
          this.activeBets.push({
            id: q.id,
            userId: q.userId,
            userName: q.userName,
            panel: q.panel,
            stake: q.stake,
            autoCashout: q.autoCashout,
            status: 'ACTIVE',
            cashoutMultiplier: null,
            payout: 0,
            createdAt: q.createdAt,
          });
        }
      }
    }

    // Seed initial immediate participants + staggered waves with unique random pilot names
    const used = new Set<string>();
    for (let i = 0; i < 6; i++) {
      this.activeBets.push(this.buildSimulatedBet(generateRandomPilotName(used)));
    }

    for (const [ws, meta] of this.clients) {
      this.sendSnapshot(ws, meta.userId);
    }

    this.scheduleSimulatedRoundBets();

    this.phaseTimer = setTimeout(() => {
      this.startFlyingPhase();
    }, BETTING_DURATION_MS);
  }

  private startFlyingPhase() {
    this.phase = 'FLYING';
    this.phaseStartedAt = Date.now();
    this.currentMultiplier = 1.0;

    this.broadcast('game:takeoff', {
      roundNumber: this.roundNumber,
      roundCode: this.roundCode,
      phaseStartedAt: this.phaseStartedAt,
      multiplier: 1.0,
    });

    if (this.crashPoint <= 1.0) {
      // Instant 1.00x crash after a brief 120ms takeoff frame
      this.phaseTimer = setTimeout(() => this.triggerCrash(), 120);
      return;
    }

    this.tickTimer = setInterval(() => {
      const elapsedSec = (Date.now() - this.phaseStartedAt) / 1000;
      const computed = Math.floor(Math.exp(GROWTH_RATE * elapsedSec) * 100) / 100;
      this.currentMultiplier = Math.max(1.0, computed);

      if (this.currentMultiplier >= this.crashPoint) {
        this.currentMultiplier = this.crashPoint;
        this.triggerCrash();
        return;
      }

      // Process server-side auto cashouts before broadcasting tick
      let cashoutOccurred = false;
      for (const bet of this.activeBets) {
        if (
          bet.status === 'ACTIVE' &&
          bet.autoCashout !== null &&
          this.currentMultiplier >= bet.autoCashout
        ) {
          this.settleCashoutBet(bet, bet.autoCashout);
          cashoutOccurred = true;
        }
      }

      this.broadcast('game:tick', {
        multiplier: this.currentMultiplier,
        elapsedMs: Date.now() - this.phaseStartedAt,
      });

      if (cashoutOccurred) {
        this.broadcastBets();
      }
    }, TICK_INTERVAL_MS);
  }

  private settleCashoutBet(bet: ActiveBet, mult: number) {
    const payout = round2(bet.stake * mult);
    bet.status = 'CASHED_OUT';
    bet.cashoutMultiplier = mult;
    bet.payout = payout;

    if (bet.isSimulated) {
      if (payout >= 3500 || mult >= 7.0) {
        this.liveLeaderboardWins.push({
          id: bet.id,
          userName: maskDisplayName(bet.userName),
          roundCode: this.roundCode,
          stake: bet.stake,
          cashoutMultiplier: mult,
          payout,
          createdAt: new Date().toISOString(),
        });
        if (this.liveLeaderboardWins.length > 50) {
          this.liveLeaderboardWins = this.liveLeaderboardWins
            .sort((a, b) => Math.max(b.payout, b.cashoutMultiplier * 100) - Math.max(a.payout, a.cashoutMultiplier * 100))
            .slice(0, 40);
        }
      }

      if (mult >= 6.0 && !this.announcedBigWinThisRound) {
        this.announcedBigWinThisRound = true;
        const msgText = `${maskDisplayName(bet.userName)} cashed out ${mult.toFixed(2)}x and won KES ${payout.toLocaleString('en-KE', { minimumFractionDigits: 2 })}!`;
        this.pushArenaChat({
          userName: 'BETKENYA 254',
          message: msgText,
          isSystem: true,
        });
      }
      return;
    }

    db.prepare('UPDATE users SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(
      payout,
      bet.userId,
    );
    this.notifyUserBalance(bet.userId);

    if (mult >= 5.0) {
      const msgId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const msgText = `${maskDisplayName(bet.userName)} cashed out ${mult.toFixed(2)}x and won KES ${payout.toLocaleString('en-KE', { minimumFractionDigits: 2 })}!`;
      db.prepare(
        `INSERT INTO chat_messages (id, user_id, user_name, message, is_system, created_at)
         VALUES (?, NULL, 'BETKENYA 254', ?, 1, ?)`,
      ).run(msgId, msgText, nowIso);
      this.broadcast('chat:message', {
        id: msgId,
        userName: 'BETKENYA 254',
        message: msgText,
        isSystem: true,
        createdAt: nowIso,
      });
    }
  }

  private triggerCrash() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
    this.clearSimTimers();

    this.phase = 'CRASHED';
    this.currentMultiplier = this.crashPoint;
    const crashedAtIso = new Date().toISOString();
    const startedAtIso = new Date(this.phaseStartedAt).toISOString();

    for (const bet of this.activeBets) {
      if (bet.status === 'ACTIVE') {
        bet.status = 'LOST';
      }
    }

    // Persist round and real user bets atomically (simulated bets remain in-memory only)
    const saveRoundTx = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO rounds (round_code, crash_point, server_seed, server_seed_hash, client_seed, started_at, crashed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          this.roundCode,
          this.crashPoint,
          this.serverSeed,
          this.serverSeedHash,
          this.clientSeed,
          startedAtIso,
          crashedAtIso,
        );

      const roundId = Number(result.lastInsertRowid);
      const insertBet = db.prepare(`
        INSERT INTO bets (id, round_id, user_id, user_name, panel, stake, auto_cashout, cashout_multiplier, payout, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const bet of this.activeBets) {
        if (bet.isSimulated) continue;
        insertBet.run(
          bet.id,
          roundId,
          bet.userId,
          bet.userName,
          bet.panel,
          bet.stake,
          bet.autoCashout,
          bet.cashoutMultiplier,
          bet.payout,
          bet.status === 'CASHED_OUT' ? 'CASHED_OUT' : 'LOST',
          bet.createdAt,
        );
      }

      return roundId;
    });

    // Natural pilot reaction in live chat after big or low rounds
    if (this.crashPoint >= 3.5 || (this.crashPoint <= 1.25 && Math.random() < 0.65)) {
      const pool = this.crashPoint >= 3.5 ? HIGH_CRASH_CHAT_LINES : LOW_CRASH_CHAT_LINES;
      const speaker = generateRandomPilotName();
      const line = pool[Math.floor(Math.random() * pool.length)];
      const chatTimer = setTimeout(() => {
        this.pushArenaChat({ userName: speaker, message: line, isSystem: false });
      }, 650);
      this.simTimers.push(chatTimer);
    }

    const roundId = saveRoundTx();

    this.broadcast('game:crashed', {
      id: roundId,
      roundNumber: this.roundNumber,
      roundCode: this.roundCode,
      crashPoint: this.crashPoint,
      serverSeed: this.serverSeed,
      serverSeedHash: this.serverSeedHash,
      clientSeed: this.clientSeed,
      crashedAt: crashedAtIso,
    });
    this.broadcastBets();

    this.roundNumber += 1;
    this.phaseTimer = setTimeout(() => {
      this.startBettingPhase();
    }, CRASHED_DURATION_MS);
  }

  public placeBet(
    userId: string,
    panel: 1 | 2,
    stakeInput: number,
    autoCashoutInput: number | null,
  ): { ok: true; mode: 'CURRENT' | 'QUEUED'; balance: number; betId: string } | { ok: false; error: string; code?: string } {
    const stake = round2(Number(stakeInput));
    if (!Number.isFinite(stake) || stake < MIN_STAKE_KES || stake > MAX_STAKE_KES) {
      return {
        ok: false,
        error: `Stake must be between KES ${MIN_STAKE_KES} and KES ${MAX_STAKE_KES.toLocaleString()}.`,
      };
    }

    let autoCashout: number | null = null;
    if (autoCashoutInput !== null && autoCashoutInput !== undefined) {
      const parsedAuto = round2(Number(autoCashoutInput));
      if (!Number.isFinite(parsedAuto) || parsedAuto < 1.01 || parsedAuto > 1000) {
        return { ok: false, error: 'Auto cash out multiplier must be between 1.01x and 1000.00x.' };
      }
      autoCashout = parsedAuto;
    }

    const placeTx = db.transaction(() => {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
      if (!user) {
        return { ok: false as const, error: 'Account not found.' };
      }
      if (user.has_deposited !== 1 || user.balance <= 0) {
        return {
          ok: false as const,
          code: 'DEPOSIT_REQUIRED',
          error: 'Deposit required before playing. Minimum deposit is KES 200.',
        };
      }
      if (user.balance < stake) {
        return {
          ok: false as const,
          code: 'INSUFFICIENT_BALANCE',
          error: `Insufficient balance (KES ${user.balance.toFixed(2)}). Please deposit at least KES 200 to continue.`,
        };
      }

      if (this.phase === 'BETTING') {
        const existing = this.activeBets.find(
          (b) => !b.isSimulated && b.userId === userId && b.panel === panel,
        );
        if (existing) {
          return { ok: false as const, error: `Panel ${panel} already has an active bet for this round.` };
        }
      } else {
        const existingQueued = this.queuedBets.find((q) => q.userId === userId && q.panel === panel);
        if (existingQueued) {
          return { ok: false as const, error: `Panel ${panel} already has a bet queued for the next round.` };
        }
      }

      db.prepare('UPDATE users SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(stake, userId);
      const updatedUser = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId) as {
        balance: number;
      };

      const betId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      if (this.phase === 'BETTING') {
        this.activeBets.push({
          id: betId,
          userId,
          userName: user.full_name,
          panel,
          stake,
          autoCashout,
          status: 'ACTIVE',
          cashoutMultiplier: null,
          payout: 0,
          createdAt,
        });
        return {
          ok: true as const,
          mode: 'CURRENT' as const,
          balance: updatedUser.balance,
          betId,
        };
      } else {
        this.queuedBets.push({
          id: betId,
          userId,
          userName: user.full_name,
          panel,
          stake,
          autoCashout,
          createdAt,
        });
        return {
          ok: true as const,
          mode: 'QUEUED' as const,
          balance: updatedUser.balance,
          betId,
        };
      }
    });

    const outcome = placeTx();
    if (outcome.ok) {
      this.notifyUserBalance(userId);
      this.broadcastBets();
    }
    return outcome;
  }

  public cancelBet(
    userId: string,
    panel: 1 | 2,
  ): { ok: true; balance: number } | { ok: false; error: string } {
    if (this.phase === 'BETTING') {
      const idx = this.activeBets.findIndex(
        (b) => !b.isSimulated && b.userId === userId && b.panel === panel && b.status === 'ACTIVE',
      );
      if (idx !== -1) {
        const [removed] = this.activeBets.splice(idx, 1);
        db.prepare('UPDATE users SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(
          removed.stake,
          userId,
        );
        const updated = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId) as {
          balance: number;
        };
        this.notifyUserBalance(userId);
        this.broadcastBets();
        return { ok: true, balance: updated.balance };
      }
    }

    const qIdx = this.queuedBets.findIndex((q) => q.userId === userId && q.panel === panel);
    if (qIdx !== -1) {
      const [removed] = this.queuedBets.splice(qIdx, 1);
      db.prepare('UPDATE users SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(
        removed.stake,
        userId,
      );
      const updated = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId) as {
        balance: number;
      };
      this.notifyUserBalance(userId);
      this.broadcastBets();
      return { ok: true, balance: updated.balance };
    }

    return { ok: false, error: 'No cancellable bet found on this panel.' };
  }

  public cashOut(
    userId: string,
    panel: 1 | 2,
  ): { ok: true; multiplier: number; payout: number; balance: number } | { ok: false; error: string } {
    if (this.phase !== 'FLYING') {
      return { ok: false, error: 'Plane is not currently in flight.' };
    }
    if (this.currentMultiplier >= this.crashPoint) {
      return { ok: false, error: 'Too late — the plane already flew away.' };
    }

    const bet = this.activeBets.find(
      (b) => !b.isSimulated && b.userId === userId && b.panel === panel && b.status === 'ACTIVE',
    );
    if (!bet) {
      return { ok: false, error: 'No active flight bet on this panel.' };
    }

    const cashoutMult = this.currentMultiplier;
    this.settleCashoutBet(bet, cashoutMult);
    this.broadcastBets();

    const updated = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId) as {
      balance: number;
    };

    return {
      ok: true,
      multiplier: cashoutMult,
      payout: bet.payout,
      balance: updated.balance,
    };
  }

  public getRecentRounds(limit = 30): PublicRoundHistoryItem[] {
    const rows = db
      .prepare('SELECT * FROM rounds ORDER BY id DESC LIMIT ?')
      .all(limit) as RoundRow[];
    return rows.map((r) => ({
      id: r.id,
      roundCode: r.round_code,
      crashPoint: r.crash_point,
      serverSeed: r.server_seed,
      serverSeedHash: r.server_seed_hash,
      clientSeed: r.client_seed,
      crashedAt: r.crashed_at,
    }));
  }
}
