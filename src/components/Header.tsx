import { LogOut, User, Volume2, VolumeX, Wallet } from 'lucide-react';
import type { PublicUser } from '../types';

interface HeaderProps {
  user: PublicUser | null;
  muted: boolean;
  onToggleMute: () => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onOpenWallet: (tab: 'deposit' | 'withdraw' | 'history') => void;
  onOpenProfile: () => void;
  onOpenHowToPlay: () => void;
  onLogout: () => void;
}

export function Header({
  user,
  muted,
  onToggleMute,
  onOpenAuth,
  onOpenWallet,
  onOpenProfile,
  onOpenHowToPlay,
  onLogout,
}: HeaderProps) {
  const firstName = user?.fullName.trim().split(/\s+/)[0] || 'Pilot';

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#11141b]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:gap-8 sm:px-6">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="#arena"
          className="font-display text-lg font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 sm:text-xl"
        >
          BETKENYA <span className="text-rose-500">254</span>
        </a>

        {/* Zone 2: Clean single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <a
            href="#arena"
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Aviator
          </a>
          <button
            type="button"
            onClick={onOpenHowToPlay}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            How to Play
          </button>
          {user && (
            <button
              type="button"
              onClick={() => onOpenWallet('history')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Transactions
            </button>
          )}
        </nav>

        {/* Zone 3: Primary User / Wallet Action */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#181c26] text-slate-300 hover:bg-[#202634] hover:text-white transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          {user ? (
            <>
              <button
                type="button"
                onClick={onOpenProfile}
                title="Pilot Profile & Stats"
                className="hidden sm:flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-[#181c26] px-3 text-xs font-semibold text-slate-200 hover:border-white/20 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <User className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                <span>{firstName}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenWallet('withdraw')}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#181c26] px-3 py-2 text-left hover:border-white/20 transition-colors cursor-pointer"
                title="Manage wallet & withdrawals"
              >
                <Wallet className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="font-mono text-sm font-semibold text-emerald-400 tabular-nums whitespace-nowrap">
                  KES {user.balance.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onOpenWallet('deposit')}
                className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:px-4"
              >
                Deposit
              </button>

              <button
                type="button"
                onClick={onLogout}
                aria-label="Log out"
                title={`Log out (${user.fullName})`}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#181c26] text-slate-300 hover:border-rose-500/40 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="rounded-lg border border-white/15 bg-[#181c26] px-3.5 py-2 text-sm font-semibold text-slate-200 hover:bg-[#222736] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('register')}
                className="rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:px-4"
              >
                Create Account
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
