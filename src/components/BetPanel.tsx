import { Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LiveBetItem, PublicUser, QueuedBetItem, RoundPhase } from '../types';

interface BetPanelProps {
  panel: 1 | 2;
  phase: RoundPhase;
  roundNumber: number;
  liveMultiplier: number;
  user: PublicUser | null;
  activeBet: LiveBetItem | undefined;
  queuedBet: QueuedBetItem | undefined;
  onPlaceBet: (panel: 1 | 2, stake: number, autoCashout: number | null) => Promise<void>;
  onCancelBet: (panel: 1 | 2) => Promise<void>;
  onCashOut: (panel: 1 | 2) => Promise<void>;
  onRequireAuth: () => void;
  onRequireDeposit: () => void;
}

const QUICK_AMOUNTS = [10, 50, 100, 500, 1000];

export function BetPanel({
  panel,
  phase,
  roundNumber,
  liveMultiplier,
  user,
  activeBet,
  queuedBet,
  onPlaceBet,
  onCancelBet,
  onCashOut,
  onRequireAuth,
  onRequireDeposit,
}: BetPanelProps) {
  const [mode, setMode] = useState<'bet' | 'auto'>('bet');
  const [stakeStr, setStakeStr] = useState('100');
  const [autoBetEnabled, setAutoBetEnabled] = useState(false);
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(true);
  const [autoCashoutStr, setAutoCashoutStr] = useState('2.00');
  const [busy, setBusy] = useState(false);

  const lastAutoPlacedRoundRef = useRef<number>(0);

  const stakeNum = Math.max(10, Math.min(100000, Math.round((Number(stakeStr) || 0) * 100) / 100));
  const autoCashoutNum =
    mode === 'auto' && autoCashoutEnabled
      ? Math.max(1.01, Math.min(1000, Math.round((Number(autoCashoutStr) || 2) * 100) / 100))
      : null;

  // Trigger Auto Bet automatically at start of BETTING phase when enabled
  useEffect(() => {
    if (
      mode === 'auto' &&
      autoBetEnabled &&
      phase === 'BETTING' &&
      user &&
      user.hasDeposited &&
      user.balance >= stakeNum &&
      !activeBet &&
      !queuedBet &&
      lastAutoPlacedRoundRef.current !== roundNumber
    ) {
      lastAutoPlacedRoundRef.current = roundNumber;
      onPlaceBet(panel, stakeNum, autoCashoutNum).catch(() => {
        setAutoBetEnabled(false);
      });
    }
  }, [
    mode,
    autoBetEnabled,
    phase,
    roundNumber,
    user,
    stakeNum,
    autoCashoutNum,
    activeBet,
    queuedBet,
    panel,
    onPlaceBet,
  ]);

  const adjustStake = (delta: number) => {
    const next = Math.max(10, Math.min(100000, (Number(stakeStr) || 0) + delta));
    setStakeStr(String(next));
  };

  const handlePrimaryClick = async () => {
    if (busy) return;

    if (!user) {
      onRequireAuth();
      return;
    }

    // Active flight cashout
    if (phase === 'FLYING' && activeBet && activeBet.status === 'ACTIVE') {
      setBusy(true);
      try {
        await onCashOut(panel);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Cancel pending or queued bet
    if ((phase === 'BETTING' && activeBet && activeBet.status === 'ACTIVE') || queuedBet) {
      setBusy(true);
      try {
        await onCancelBet(panel);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Cannot play without depositing (min KES 200) or sufficient balance
    if (!user.hasDeposited || user.balance <= 0 || user.balance < stakeNum) {
      onRequireDeposit();
      return;
    }

    setBusy(true);
    try {
      await onPlaceBet(panel, stakeNum, autoCashoutNum);
    } finally {
      setBusy(false);
    }
  };

  // Determine Button Appearance
  const isCashoutReady = phase === 'FLYING' && activeBet && activeBet.status === 'ACTIVE';
  const isCancelReady = (phase === 'BETTING' && activeBet && activeBet.status === 'ACTIVE') || Boolean(queuedBet);
  const currentWin = activeBet ? (activeBet.stake * liveMultiplier).toFixed(2) : '0.00';

  let btnClass = 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50';
  let btnTitle = 'BET';
  let btnSub = `${stakeNum.toFixed(2)} KES`;

  if (!user) {
    btnClass = 'bg-emerald-600 hover:bg-emerald-500 text-white';
    btnTitle = 'BET';
    btnSub = 'Login to Play';
  } else if (isCashoutReady) {
    btnClass = 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-950/40';
    btnTitle = 'CASH OUT';
    btnSub = `${currentWin} KES`;
  } else if (isCancelReady) {
    btnClass = 'bg-rose-600 hover:bg-rose-500 text-white';
    btnTitle = 'CANCEL';
    btnSub = queuedBet ? 'Waiting for next round' : 'Bet Placed';
  } else if (!user.hasDeposited || user.balance < 10) {
    btnClass = 'bg-emerald-600 hover:bg-emerald-500 text-white';
    btnTitle = 'DEPOSIT TO BET';
    btnSub = 'Min Deposit 200 KES';
  } else if (phase !== 'BETTING') {
    btnClass = 'bg-emerald-600 hover:bg-emerald-500 text-white';
    btnTitle = 'BET';
    btnSub = `${stakeNum.toFixed(2)} KES (Next Round)`;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#12161f] p-3.5 sm:p-4">
      {/* Top Mode Segmented Control */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-[#0b0d12] p-1 border border-white/5">
          <button
            type="button"
            onClick={() => setMode('bet')}
            className={`rounded-md px-4 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              mode === 'bet' ? 'bg-[#222836] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Bet
          </button>
          <button
            type="button"
            onClick={() => setMode('auto')}
            className={`rounded-md px-4 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              mode === 'auto' ? 'bg-[#222836] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Auto
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={isCancelReady || Boolean(isCashoutReady)}
            onClick={() => setStakeStr(String(Math.max(10, Math.floor(stakeNum / 2))))}
            className="rounded border border-white/10 bg-[#181d28] px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
          >
            1/2
          </button>
          <button
            type="button"
            disabled={isCancelReady || Boolean(isCashoutReady)}
            onClick={() => setStakeStr(String(Math.min(100000, Math.round(stakeNum * 2))))}
            className="rounded border border-white/10 bg-[#181d28] px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
          >
            2x
          </button>
          <span className="ml-1 text-xs font-medium text-slate-400">Panel {panel}</span>
        </div>
      </div>

      {/* Main Controls Row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-stretch">
        {/* Left Stake & Quick Amounts */}
        <div className="flex flex-col justify-between gap-2 sm:col-span-6">
          <div className="flex items-center rounded-lg border border-white/10 bg-[#0b0d12] px-1.5 py-1">
            <button
              type="button"
              onClick={() => adjustStake(-10)}
              disabled={isCancelReady || Boolean(isCashoutReady)}
              aria-label="Decrease stake"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-[#181d28] text-slate-300 hover:bg-[#222938] disabled:opacity-40 cursor-pointer"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>

            <div className="flex flex-1 items-center justify-center gap-1 px-2">
              <input
                type="number"
                min={10}
                max={100000}
                step={10}
                value={stakeStr}
                disabled={isCancelReady || Boolean(isCashoutReady)}
                onChange={(e) => setStakeStr(e.target.value)}
                className="w-full bg-transparent text-center font-mono text-base font-bold text-white tabular-nums focus:outline-none disabled:opacity-60"
                aria-label={`Panel ${panel} stake in KES`}
              />
            </div>

            <button
              type="button"
              onClick={() => adjustStake(10)}
              disabled={isCancelReady || Boolean(isCashoutReady)}
              aria-label="Increase stake"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-[#181d28] text-slate-300 hover:bg-[#222938] disabled:opacity-40 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                disabled={isCancelReady || Boolean(isCashoutReady)}
                onClick={() => setStakeStr(String(amt))}
                className="rounded-md border border-white/5 bg-[#181d28] py-1 font-mono text-xs font-medium text-slate-300 hover:bg-[#232a3a] hover:text-white disabled:opacity-40 transition-colors tabular-nums cursor-pointer"
              >
                {amt}
              </button>
            ))}
          </div>
        </div>

        {/* Right Primary Bet / Cash Out Button */}
        <div className="sm:col-span-6">
          <button
            type="button"
            onClick={handlePrimaryClick}
            disabled={busy}
            className={`flex h-full min-h-[76px] w-full flex-col items-center justify-center rounded-xl px-4 py-3 shadow-md transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer ${btnClass}`}
          >
            <span className="font-display text-lg font-extrabold tracking-wide leading-tight">
              {btnTitle}
            </span>
            <span className="mt-0.5 font-mono text-xs font-semibold opacity-95 tabular-nums">
              {btnSub}
            </span>
          </button>
        </div>
      </div>

      {/* Auto Mode Row */}
      {mode === 'auto' && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoBetEnabled}
              onChange={(e) => setAutoBetEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-[#0b0d12] accent-emerald-500"
            />
            <span>Auto Bet</span>
          </label>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoCashoutEnabled}
                onChange={(e) => setAutoCashoutEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-[#0b0d12] accent-emerald-500"
              />
              <span>Auto Cash Out</span>
            </label>
            <div className="flex items-center rounded-md border border-white/10 bg-[#0b0d12] px-2 py-1">
              <input
                type="number"
                min={1.01}
                max={1000}
                step={0.1}
                value={autoCashoutStr}
                disabled={!autoCashoutEnabled}
                onChange={(e) => setAutoCashoutStr(e.target.value)}
                className="w-16 bg-transparent text-right font-mono text-xs font-semibold text-white tabular-nums focus:outline-none disabled:opacity-40"
              />
              <span className="ml-1 font-mono text-xs text-slate-400">x</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
