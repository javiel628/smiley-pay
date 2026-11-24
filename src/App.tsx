import { AlertCircle, CheckCircle2, Gift, Wallet } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { AviatorCanvas } from './components/AviatorCanvas';
import { BetPanel } from './components/BetPanel';
import { Header } from './components/Header';
import { HowToPlayModal } from './components/InfoModals';
import { LiveBetsSidebar } from './components/LiveBetsSidebar';
import { MultiplierHistoryBar } from './components/MultiplierHistoryBar';
import { ProfileModal } from './components/ProfileModal';
import { WalletModal } from './components/WalletModal';
import type {
  ChatMessageItem,
  DepositUpdateEvent,
  GameSnapshot,
  LiveBetItem,
  MyBetHistoryItem,
  PublicUser,
  QueuedBetItem,
  RoundHistoryItem,
  TopWinItem,
} from './types';
import { soundFx } from './utils/soundFx';

interface ToastState {
  id: number;
  type: 'success' | 'error';
  message: string;
}

const DEFAULT_SNAPSHOT: GameSnapshot = {
  phase: 'BETTING',
  roundNumber: 1,
  roundCode: 'BK-1001',
  serverSeedHash: '',
  clientSeed: '',
  serverSeed: null,
  crashPoint: null,
  multiplier: 1.0,
  phaseStartedAt: Date.now(),
  bettingEndsAt: Date.now() + 5500,
  serverTime: Date.now(),
  onlinePlayers: 1,
  bets: [],
  myQueuedBets: [],
};

export default function App() {
  // Token kept strictly in React memory (never localStorage/sessionStorage)
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;

  const [snapshot, setSnapshot] = useState<GameSnapshot>(DEFAULT_SNAPSHOT);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [history, setHistory] = useState<RoundHistoryItem[]>([]);
  const [myBets, setMyBets] = useState<MyBetHistoryItem[]>([]);
  const [topWins, setTopWins] = useState<TopWinItem[]>([]);
  const [topMultipliers, setTopMultipliers] = useState<TopWinItem[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [cashoutBanner, setCashoutBanner] = useState<{ multiplier: number; payout: number } | null>(
    null,
  );

  const [muted, setMuted] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletTab, setWalletTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');
  const [profileOpen, setProfileOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [lastDepositUpdate, setLastDepositUpdate] = useState<DepositUpdateEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = Date.now();
    setToast({ id, type, message });
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 4200);
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/game/history');
      if (res.ok) {
        const data = (await res.json()) as { rounds: RoundHistoryItem[] };
        setHistory(data.rounds || []);
      }
    } catch {
      // Ignore transient network errors
    }
  }, []);

  const fetchTopWins = useCallback(async () => {
    try {
      const res = await fetch('/api/game/top-wins');
      if (res.ok) {
        const data = (await res.json()) as {
          topWins: TopWinItem[];
          topMultipliers?: TopWinItem[];
        };
        setTopWins(data.topWins || []);
        setTopMultipliers(data.topMultipliers || []);
      }
    } catch {
      // Ignore
    }
  }, []);

  const fetchChat = useCallback(async () => {
    try {
      const res = await fetch('/api/chat');
      if (res.ok) {
        const data = (await res.json()) as { messages: ChatMessageItem[] };
        setChatMessages(data.messages || []);
      }
    } catch {
      // Ignore
    }
  }, []);

  const fetchMyBets = useCallback(async (authToken?: string | null) => {
    const activeToken = authToken ?? tokenRef.current;
    if (!activeToken) return;
    try {
      const res = await fetch('/api/game/my-bets', {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { bets: MyBetHistoryItem[] };
        setMyBets(data.bets || []);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    fetchTopWins();
    fetchChat();
  }, [fetchHistory, fetchTopWins, fetchChat]);

  // Prevent browser zoom / unzoom on desktop (Ctrl/Cmd + wheel or +/-/0) and Safari gestures without blocking touch scroll
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '_', '0'].includes(e.key)) {
        e.preventDefault();
      }
    };

    const handleGesture = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('gesturestart', handleGesture, { passive: false });
    document.addEventListener('gesturechange', handleGesture, { passive: false });
    document.addEventListener('gestureend', handleGesture, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('gesturestart', handleGesture);
      document.removeEventListener('gesturechange', handleGesture);
      document.removeEventListener('gestureend', handleGesture);
    };
  }, []);

  // Persistent WebSocket connection with automatic reconnect
  useEffect(() => {
    let closedByUnmount = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = () => {
      if (closedByUnmount) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const qs = tokenRef.current ? `?token=${encodeURIComponent(tokenRef.current)}` : '';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws${qs}`);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string) as { event: string; data: unknown };
          if (msg.event === 'game:snapshot') {
            const snap = msg.data as GameSnapshot;
            setServerTimeOffsetMs(snap.serverTime - Date.now());
            setSnapshot(snap);
            if (snap.phase === 'BETTING') {
              setCashoutBanner(null);
            }
          } else if (msg.event === 'game:takeoff') {
            const d = msg.data as {
              roundNumber: number;
              roundCode: string;
              phaseStartedAt: number;
              multiplier: number;
            };
            soundFx.playTakeoff();
            setCashoutBanner(null);
            setSnapshot((prev) => ({
              ...prev,
              phase: 'FLYING',
              roundNumber: d.roundNumber,
              roundCode: d.roundCode,
              phaseStartedAt: d.phaseStartedAt,
              multiplier: d.multiplier,
              crashPoint: null,
              serverSeed: null,
            }));
          } else if (msg.event === 'game:tick') {
            const d = msg.data as { multiplier: number };
            setSnapshot((prev) =>
              prev.phase === 'FLYING' ? { ...prev, multiplier: d.multiplier } : prev,
            );
          } else if (msg.event === 'game:bets') {
            const d = msg.data as { bets: LiveBetItem[]; myQueuedBets: QueuedBetItem[] };
            setSnapshot((prev) => ({
              ...prev,
              bets: d.bets,
              myQueuedBets: d.myQueuedBets,
            }));
          } else if (msg.event === 'game:crashed') {
            const d = msg.data as {
              id: number;
              roundCode: string;
              crashPoint: number;
              serverSeed: string;
              serverSeedHash: string;
              clientSeed: string;
              crashedAt: string;
            };
            soundFx.playCrash();
            setSnapshot((prev) => ({
              ...prev,
              phase: 'CRASHED',
              multiplier: d.crashPoint,
              crashPoint: d.crashPoint,
              serverSeed: d.serverSeed,
            }));
            setHistory((prev) => [
              {
                id: d.id,
                roundCode: d.roundCode,
                crashPoint: d.crashPoint,
                serverSeed: d.serverSeed,
                serverSeedHash: d.serverSeedHash,
                clientSeed: d.clientSeed,
                crashedAt: d.crashedAt,
              },
              ...prev.filter((r) => r.id !== d.id).slice(0, 31),
            ]);
            if (tokenRef.current) {
              fetchMyBets(tokenRef.current);
            }
            fetchTopWins();
          } else if (msg.event === 'chat:message') {
            const chatMsg = msg.data as ChatMessageItem;
            setChatMessages((prev) =>
              prev.some((m) => m.id === chatMsg.id)
                ? prev
                : [...prev.slice(-49), chatMsg],
            );
          } else if (msg.event === 'user:balance') {
            const updatedUser = msg.data as PublicUser;
            setUser(updatedUser);
          } else if (msg.event === 'wallet:deposit_update') {
            const evtData = msg.data as DepositUpdateEvent;
            setLastDepositUpdate(evtData);
            if (evtData.status === 'COMPLETED') {
              if (evtData.user) setUser(evtData.user);
              const baseAmount = evtData.transaction?.amount.toFixed(2) ?? '0.00';
              if (evtData.bonusAwarded && evtData.bonusAwarded > 0) {
                showToast(
                  'success',
                  `M-Pesa deposit of KES ${baseAmount} + KES ${evtData.bonusAwarded.toFixed(2)} 2x Bonus credited!`,
                );
              } else {
                showToast(
                  'success',
                  `M-Pesa deposit of KES ${baseAmount} confirmed!`,
                );
              }
            } else if (evtData.status === 'FAILED') {
              showToast(
                'error',
                evtData.transaction?.result_desc || 'M-Pesa deposit was cancelled or failed.',
              );
            }
          }
        } catch {
          // Ignore malformed server payload
        }
      };

      ws.onclose = () => {
        if (closedByUnmount) return;
        const delay = Math.min(5000, 600 * Math.pow(1.5, attempt));
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedByUnmount = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [fetchMyBets, fetchTopWins, showToast]);

  // Notify live WebSocket whenever auth token changes
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'auth:update', token }));
    }
  }, [token]);

  const handleAuthSuccess = (nextToken: string, nextUser: PublicUser) => {
    setToken(nextToken);
    setUser(nextUser);
    fetchMyBets(nextToken);
    if (!nextUser.hasDeposited) {
      showToast(
        'success',
        nextUser.hasDoubleBonusPromo
          ? '2x Deposit Bonus active! Deposit KES 200+ to receive 2x your deposit.'
          : 'Account ready! Deposit at least KES 200 to place your first flight bet.',
      );
      setWalletTab('deposit');
      setWalletOpen(true);
    } else {
      showToast(
        'success',
        nextUser.hasDoubleBonusPromo
          ? `Welcome back, ${nextUser.fullName}! 2x Deposit Promo active.`
          : `Welcome back, ${nextUser.fullName}!`,
      );
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setMyBets([]);
    setProfileOpen(false);
    showToast('success', 'You have logged out.');
  };

  const handlePlaceBet = useCallback(
    async (panel: 1 | 2, stake: number, autoCashout: number | null) => {
      if (!tokenRef.current) {
        setAuthMode('login');
        setAuthModalOpen(true);
        return;
      }
      soundFx.playClick();
      const res = await fetch('/api/game/bet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({ panel, stake, autoCashout }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        balance?: number;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        showToast('error', data.error || 'Could not place bet.');
        if (data.code === 'DEPOSIT_REQUIRED' || data.code === 'INSUFFICIENT_BALANCE') {
          setWalletTab('deposit');
          setWalletOpen(true);
        }
        throw new Error(data.error || 'Bet failed');
      }
      if (typeof data.balance === 'number') {
        const nextBal = data.balance;
        setUser((u) => (u ? { ...u, balance: nextBal } : u));
      }
    },
    [showToast],
  );

  const handleCancelBet = useCallback(
    async (panel: 1 | 2) => {
      if (!tokenRef.current) return;
      soundFx.playClick();
      const res = await fetch('/api/game/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({ panel }),
      });
      const data = (await res.json()) as { balance?: number; error?: string };
      if (!res.ok) {
        showToast('error', data.error || 'Could not cancel bet.');
        return;
      }
      if (typeof data.balance === 'number') {
        const nextBal = data.balance;
        setUser((u) => (u ? { ...u, balance: nextBal } : u));
      }
    },
    [showToast],
  );

  const handleCashOut = useCallback(
    async (panel: 1 | 2) => {
      if (!tokenRef.current) return;
      const res = await fetch('/api/game/cashout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({ panel }),
      });
      const data = (await res.json()) as {
        multiplier?: number;
        payout?: number;
        balance?: number;
        error?: string;
      };
      if (!res.ok) {
        showToast('error', data.error || 'Cash out failed.');
        return;
      }
      soundFx.playCashout();
      if (typeof data.balance === 'number') {
        const nextBal = data.balance;
        setUser((u) => (u ? { ...u, balance: nextBal } : u));
      }
      if (typeof data.multiplier === 'number' && typeof data.payout === 'number') {
        setCashoutBanner({ multiplier: data.multiplier, payout: data.payout });
      }
      showToast(
        'success',
        `Cashed out KES ${data.payout?.toFixed(2)} @ ${data.multiplier?.toFixed(2)}x!`,
      );
    },
    [showToast],
  );

  const handleSendChat = useCallback(
    async (message: string) => {
      if (!tokenRef.current) {
        setAuthMode('login');
        setAuthModalOpen(true);
        return;
      }
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json()) as { message?: ChatMessageItem; error?: string };
      if (!res.ok) {
        showToast('error', data.error || 'Could not send chat message.');
        throw new Error(data.error || 'Chat failed');
      }
      if (data.message) {
        const sent = data.message;
        setChatMessages((prev) =>
          prev.some((m) => m.id === sent.id) ? prev : [...prev.slice(-49), sent],
        );
      }
    },
    [showToast],
  );

  const toggleMute = () => {
    soundFx.muted = !muted;
    setMuted(!muted);
  };

  const panel1ActiveBet = snapshot.bets.find((b) => b.isOwn && b.panel === 1);
  const panel2ActiveBet = snapshot.bets.find((b) => b.isOwn && b.panel === 2);
  const panel1QueuedBet = snapshot.myQueuedBets.find((q) => q.panel === 1);
  const panel2QueuedBet = snapshot.myQueuedBets.find((q) => q.panel === 2);

  return (
    <div className="flex min-h-dvh w-full max-w-full flex-col overflow-x-clip bg-[#0b0d11] text-slate-100">
      <Header
        user={user}
        muted={muted}
        onToggleMute={toggleMute}
        onOpenAuth={(m) => {
          setAuthMode(m);
          setAuthModalOpen(true);
        }}
        onOpenWallet={(tab) => {
          setWalletTab(tab);
          setWalletOpen(true);
        }}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenHowToPlay={() => setHowToPlayOpen(true)}
        onLogout={handleLogout}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed right-4 top-20 z-50 max-w-sm">
          <div
            className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-semibold shadow-2xl ${
              toast.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/95 text-emerald-200'
                : 'border-rose-500/40 bg-rose-950/95 text-rose-200'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Arena */}
      <main id="arena" className="mx-auto w-full max-w-[1440px] flex-1 px-3 py-3 sm:px-5 sm:py-3.5">
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          {/* Left Column: Live Bets, My Bets, Top, Chat */}
          <div className="order-2 lg:order-1 lg:col-span-4 xl:col-span-3">
            <LiveBetsSidebar
              liveBets={snapshot.bets}
              myBets={myBets}
              topWins={topWins}
              topMultipliers={topMultipliers}
              chatMessages={chatMessages}
              onlinePlayers={snapshot.onlinePlayers}
              isLoggedIn={Boolean(user)}
              onRefreshMyBets={() => fetchMyBets()}
              onRefreshTopWins={fetchTopWins}
              onSendChat={handleSendChat}
              onRequireAuth={() => {
                setAuthMode('login');
                setAuthModalOpen(true);
              }}
            />
          </div>

          {/* Right Column: History Bar + Aviator Flight Canvas + Dual Bet Panels */}
          <div className="order-1 flex flex-col gap-3.5 lg:order-2 lg:col-span-8 xl:col-span-9">
            <MultiplierHistoryBar history={history} />

            <AviatorCanvas
              phase={snapshot.phase}
              multiplier={snapshot.multiplier}
              crashPoint={snapshot.crashPoint}
              roundCode={snapshot.roundCode}
              phaseStartedAt={snapshot.phaseStartedAt}
              bettingEndsAt={snapshot.bettingEndsAt}
              serverTimeOffsetMs={serverTimeOffsetMs}
              cashoutBanner={cashoutBanner}
            />

            {/* 2x Deposit Bonus Promo Callout (never reveals code) */}
            {user?.hasDoubleBonusPromo ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2 text-emerald-200">
                  <Gift className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>2x Deposit Bonus Active:</strong> Every M-Pesa deposit receives a 100% matching bonus (e.g. deposit KES 200 to play with KES 400).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setWalletTab('deposit');
                    setWalletOpen(true);
                  }}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-500 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Deposit Now
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/25 bg-[#151823] px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2 text-slate-200">
                  <Gift className="h-4 w-4 text-rose-400 shrink-0" />
                  <span>
                    <strong className="text-white">2x Deposit Bonus Offer:</strong> Apply a valid promo code on Login or Sign Up to double your deposit — deposit KES 200 and get KES 400 total.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(user ? 'login' : 'register');
                    setAuthModalOpen(true);
                  }}
                  className="rounded-lg border border-rose-500/35 bg-rose-500/15 px-3 py-1.5 font-semibold text-rose-300 hover:bg-rose-500/25 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {user ? 'Apply Promo at Login' : 'Sign Up with Promo'}
                </button>
              </div>
            )}

            {/* Deposit Gate Notice when logged in without deposit / insufficient balance */}
            {user && (!user.hasDeposited || user.balance < 10) && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-950/25 px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2 text-amber-200">
                  <Wallet className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>
                    {!user.hasDeposited
                      ? 'Deposit required before playing. Minimum deposit is KES 200.'
                      : 'Your balance is below KES 10. Deposit at least KES 200 to keep flying.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setWalletTab('deposit');
                    setWalletOpen(true);
                  }}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-500 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Deposit KES 200+
                </button>
              </div>
            )}

            {/* Dual Aviator Bet Panels */}
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <BetPanel
                panel={1}
                phase={snapshot.phase}
                roundNumber={snapshot.roundNumber}
                liveMultiplier={snapshot.multiplier}
                user={user}
                activeBet={panel1ActiveBet}
                queuedBet={panel1QueuedBet}
                onPlaceBet={handlePlaceBet}
                onCancelBet={handleCancelBet}
                onCashOut={handleCashOut}
                onRequireAuth={() => {
                  setAuthMode('login');
                  setAuthModalOpen(true);
                }}
                onRequireDeposit={() => {
                  showToast('error', 'Minimum deposit is KES 200 to place Aviator bets.');
                  setWalletTab('deposit');
                  setWalletOpen(true);
                }}
              />

              <BetPanel
                panel={2}
                phase={snapshot.phase}
                roundNumber={snapshot.roundNumber}
                liveMultiplier={snapshot.multiplier}
                user={user}
                activeBet={panel2ActiveBet}
                queuedBet={panel2QueuedBet}
                onPlaceBet={handlePlaceBet}
                onCancelBet={handleCancelBet}
                onCashOut={handleCashOut}
                onRequireAuth={() => {
                  setAuthMode('login');
                  setAuthModalOpen(true);
                }}
                onRequireDeposit={() => {
                  showToast('error', 'Minimum deposit is KES 200 to place Aviator bets.');
                  setWalletTab('deposit');
                  setWalletOpen(true);
                }}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-white/10 bg-[#0d1016] py-2.5">
        <div className="mx-auto flex max-w-[1440px] items-center justify-center px-4 text-xs text-slate-400 sm:px-6">
          <div className="font-medium text-slate-300">© BETKENYA 2026</div>
        </div>
      </footer>

      {/* Modals */}
      <AuthModal
        open={authModalOpen}
        initialMode={authMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      <WalletModal
        open={walletOpen}
        initialTab={walletTab}
        token={token}
        user={user}
        lastDepositUpdate={lastDepositUpdate}
        onClose={() => setWalletOpen(false)}
        onUserUpdated={(updatedUser) => setUser(updatedUser)}
      />

      <HowToPlayModal open={howToPlayOpen} onClose={() => setHowToPlayOpen(false)} />

      <ProfileModal
        open={profileOpen}
        token={token}
        user={user}
        onClose={() => setProfileOpen(false)}
        onOpenDeposit={() => {
          setProfileOpen(false);
          setWalletTab('deposit');
          setWalletOpen(true);
        }}
      />
    </div>
  );
}
