import { MessageSquare, Send, Trophy } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessageItem, LiveBetItem, MyBetHistoryItem, TopWinItem } from '../types';

interface LiveBetsSidebarProps {
  liveBets: LiveBetItem[];
  myBets: MyBetHistoryItem[];
  topWins: TopWinItem[];
  topMultipliers: TopWinItem[];
  chatMessages: ChatMessageItem[];
  onlinePlayers: number;
  isLoggedIn: boolean;
  onRefreshMyBets: () => void;
  onRefreshTopWins: () => void;
  onSendChat: (message: string) => Promise<void>;
  onRequireAuth: () => void;
}

export function LiveBetsSidebar({
  liveBets,
  myBets,
  topWins,
  topMultipliers,
  chatMessages,
  onlinePlayers,
  isLoggedIn,
  onRefreshMyBets,
  onRefreshTopWins,
  onSendChat,
  onRequireAuth,
}: LiveBetsSidebarProps) {
  const [tab, setTab] = useState<'all' | 'my' | 'top' | 'chat'>('all');
  const [topSubTab, setTopSubTab] = useState<'wins' | 'mult'>('wins');
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const totalRoundStake = liveBets.reduce((sum, b) => sum + b.stake, 0);
  const totalRoundWin = liveBets.reduce((sum, b) => sum + b.payout, 0);

  const switchTab = (next: 'all' | 'my' | 'top' | 'chat') => {
    setTab(next);
    if (next === 'my' && isLoggedIn) onRefreshMyBets();
    if (next === 'top') onRefreshTopWins();
  };

  useEffect(() => {
    if (tab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [tab, chatMessages.length]);

  const handleChatSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      onRequireAuth();
      return;
    }
    const clean = chatInput.trim();
    if (!clean || sendingChat) return;
    setSendingChat(true);
    try {
      await onSendChat(clean);
      setChatInput('');
    } finally {
      setSendingChat(false);
    }
  };

  const displayedTop = topSubTab === 'wins' ? topWins : topMultipliers;

  return (
    <aside className="flex flex-col rounded-xl border border-white/10 bg-[#12161f] overflow-hidden h-[420px] lg:h-[590px]">
      {/* Segmented Tabs */}
      <div className="border-b border-white/10 p-3">
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-[#0b0d12] p-1 border border-white/5">
          <button
            type="button"
            onClick={() => switchTab('all')}
            className={`rounded-md py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'all' ? 'bg-[#222836] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Bets
          </button>
          <button
            type="button"
            onClick={() => switchTab('my')}
            className={`rounded-md py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'my' ? 'bg-[#222836] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            My Bets
          </button>
          <button
            type="button"
            onClick={() => switchTab('top')}
            className={`rounded-md py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'top' ? 'bg-[#222836] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Top
          </button>
          <button
            type="button"
            onClick={() => switchTab('chat')}
            className={`inline-flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'chat' ? 'bg-[#222836] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="h-3 w-3" />
            <span>Chat</span>
          </button>
        </div>

        {/* Round Stats Summary */}
        {tab === 'all' && (
          <div className="mt-3 flex items-center justify-between text-xs">
            <div className="text-slate-400">
              <span className="font-semibold text-white tabular-nums">{liveBets.length}</span> Bets
              <span className="mx-1.5 text-slate-600">·</span>
              <span className="tabular-nums">{onlinePlayers}</span> Online
            </div>
            <div className="font-mono font-semibold text-emerald-400 tabular-nums">
              {totalRoundWin > 0
                ? `Won ${totalRoundWin.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`
                : `Pool ${totalRoundStake.toLocaleString('en-KE', { minimumFractionDigits: 2 })} KES`}
            </div>
          </div>
        )}

        {tab === 'top' && (
          <div className="mt-2.5 grid grid-cols-2 gap-1 rounded-lg bg-[#0b0d12] p-1 border border-white/5">
            <button
              type="button"
              onClick={() => setTopSubTab('wins')}
              className={`rounded py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                topSubTab === 'wins' ? 'bg-[#1f2634] text-amber-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              Huge Wins
            </button>
            <button
              type="button"
              onClick={() => setTopSubTab('mult')}
              className={`rounded py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                topSubTab === 'mult' ? 'bg-[#1f2634] text-violet-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              Multipliers
            </button>
          </div>
        )}
      </div>

      {/* Table Header (for bet tabs) */}
      {tab !== 'chat' && (
        <div className="grid grid-cols-12 gap-2 border-b border-white/5 px-3 py-2 text-[11px] font-semibold text-slate-400">
          <span className="col-span-4">{tab === 'my' ? 'Round' : 'User'}</span>
          <span className="col-span-3 text-right">Bet KES</span>
          <span className="col-span-2 text-right">X</span>
          <span className="col-span-3 text-right">Cash out</span>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto arena-scroll px-2 py-1.5 space-y-1">
        {tab === 'all' && (
          <>
            {liveBets.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center text-xs text-slate-500">
                <p>No active bets in this round yet.</p>
                <p className="mt-1 text-slate-600">Place a bet on Panel 1 or Panel 2 to join the flight.</p>
              </div>
            ) : (
              [...liveBets]
                .sort((a, b) => {
                  if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
                  if (a.status === 'CASHED_OUT' && b.status !== 'CASHED_OUT') return -1;
                  if (b.status === 'CASHED_OUT' && a.status !== 'CASHED_OUT') return 1;
                  if (a.status === 'CASHED_OUT' && b.status === 'CASHED_OUT') {
                    return b.payout - a.payout;
                  }
                  return b.stake - a.stake;
                })
                .map((b) => (
                <div
                  key={b.id}
                  className={`grid grid-cols-12 items-center gap-2 rounded-lg px-2 py-2 text-xs ${
                    b.status === 'CASHED_OUT'
                      ? 'border border-emerald-500/25 bg-emerald-950/30'
                      : b.isOwn
                      ? 'border border-white/10 bg-[#191f2c]'
                      : 'bg-[#0e121a]'
                  }`}
                >
                  <span className="col-span-4 truncate font-medium text-slate-200">
                    {b.isOwn ? `${b.userName} (You)` : b.userName}
                  </span>
                  <span className="col-span-3 text-right font-mono text-slate-300 tabular-nums">
                    {b.stake.toFixed(0)}
                  </span>
                  <span className="col-span-2 text-right font-mono tabular-nums">
                    {b.cashoutMultiplier ? (
                      <span className="text-violet-300 font-semibold">
                        {b.cashoutMultiplier.toFixed(2)}x
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </span>
                  <span className="col-span-3 text-right font-mono font-semibold tabular-nums">
                    {b.status === 'CASHED_OUT' ? (
                      <span className="text-emerald-400">{b.payout.toFixed(2)}</span>
                    ) : b.status === 'LOST' ? (
                      <span className="text-rose-400/80">Lost</span>
                    ) : (
                      <span className="text-slate-500">In flight</span>
                    )}
                  </span>
                </div>
              ))
            )}
          </>
        )}

        {tab === 'my' && (
          <>
            {!isLoggedIn ? (
              <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-500">
                Log in to view your personal Aviator bet history.
              </div>
            ) : myBets.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-500">
                You have not placed any settled bets yet.
              </div>
            ) : (
              myBets.map((b) => (
                <div
                  key={b.id}
                  className={`grid grid-cols-12 items-center gap-2 rounded-lg px-2 py-2 text-xs ${
                    b.status === 'CASHED_OUT'
                      ? 'border border-emerald-500/25 bg-emerald-950/30'
                      : 'bg-[#0e121a]'
                  }`}
                >
                  <span className="col-span-4 truncate font-mono text-slate-300">
                    {b.roundCode}
                  </span>
                  <span className="col-span-3 text-right font-mono text-slate-300 tabular-nums">
                    {b.stake.toFixed(0)}
                  </span>
                  <span className="col-span-2 text-right font-mono tabular-nums">
                    {b.cashoutMultiplier ? (
                      <span className="text-violet-300 font-semibold">
                        {b.cashoutMultiplier.toFixed(2)}x
                      </span>
                    ) : (
                      <span className="text-rose-400">{b.crashPoint.toFixed(2)}x</span>
                    )}
                  </span>
                  <span className="col-span-3 text-right font-mono font-semibold tabular-nums">
                    {b.status === 'CASHED_OUT' ? (
                      <span className="text-emerald-400">{b.payout.toFixed(2)}</span>
                    ) : (
                      <span className="text-rose-400">0.00</span>
                    )}
                  </span>
                </div>
              ))
            )}
          </>
        )}

        {tab === 'top' && (
          <>
            {displayedTop.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-slate-500">
                <Trophy className="h-5 w-5 text-amber-400/70" />
                <p>No big wins recorded yet. Be the first on the leaderboard!</p>
              </div>
            ) : (
              displayedTop.map((w) => (
                <div
                  key={w.id}
                  className="grid grid-cols-12 items-center gap-2 rounded-lg border border-amber-500/15 bg-[#161a24] px-2 py-2 text-xs"
                >
                  <span className="col-span-4 truncate font-medium text-slate-200">
                    {w.userName}
                  </span>
                  <span className="col-span-3 text-right font-mono text-slate-300 tabular-nums">
                    {w.stake.toFixed(0)}
                  </span>
                  <span className="col-span-2 text-right font-mono font-semibold text-amber-300 tabular-nums">
                    {w.cashoutMultiplier ? `${w.cashoutMultiplier.toFixed(2)}x` : '—'}
                  </span>
                  <span className="col-span-3 text-right font-mono font-semibold text-emerald-400 tabular-nums">
                    {w.payout.toFixed(0)}
                  </span>
                </div>
              ))
            )}
          </>
        )}

        {tab === 'chat' && (
          <div className="flex flex-col gap-2 px-1 py-1">
            {chatMessages.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No pilot messages yet. Say hello or hit a 5.00x+ flight to celebrate!
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg px-2.5 py-2 text-xs ${
                    msg.isSystem
                      ? 'border border-emerald-500/30 bg-emerald-950/30 text-emerald-200'
                      : 'bg-[#0b0d12] text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span
                      className={`font-semibold ${
                        msg.isSystem ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {msg.userName}
                    </span>
                    <span className="text-[10px] text-slate-500 tabular-nums">
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="break-words leading-relaxed">{msg.message}</p>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Chat Composer */}
      {tab === 'chat' && (
        <form onSubmit={handleChatSubmit} className="border-t border-white/10 p-2.5">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              maxLength={180}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={isLoggedIn ? 'Send a message...' : 'Log in to chat'}
              className="flex-1 rounded-lg border border-white/10 bg-[#0b0d12] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={sendingChat}
              aria-label="Send message"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      )}
    </aside>
  );
}
