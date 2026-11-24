import { Award, Gift, Mail, Phone, TrendingUp, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PlayerStats, PublicUser } from '../types';

interface ProfileModalProps {
  open: boolean;
  token: string | null;
  user: PublicUser | null;
  onClose: () => void;
  onOpenDeposit: () => void;
}

export function ProfileModal({
  open,
  token,
  user,
  onClose,
  onOpenDeposit,
}: ProfileModalProps) {
  const [stats, setStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    fetch('/api/game/my-stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PlayerStats | null) => {
        if (data) setStats(data);
      })
      .catch(() => {});
  }, [open, token]);

  if (!open || !user) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#12161f] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 id="profile-modal-title" className="font-display text-lg font-bold text-white">
                {user.fullName}
              </h2>
              <p className="text-xs text-slate-400">BETKENYA 254 Pilot Profile</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile modal"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#181d28] text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="rounded-xl border border-white/10 bg-[#0b0d12] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <Phone className="h-3.5 w-3.5" />
                Phone
              </span>
              <span className="font-mono font-semibold text-white">{user.phone}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <Mail className="h-3.5 w-3.5" />
                Email
              </span>
              <span className="font-medium text-white">{user.email}</span>
            </div>
          </div>

          <div
            className={`flex items-center justify-between rounded-xl border p-3.5 ${
              user.hasDoubleBonusPromo
                ? 'border-amber-500/35 bg-amber-950/25'
                : 'border-white/10 bg-[#0b0d12]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Gift
                className={`h-4 w-4 shrink-0 ${
                  user.hasDoubleBonusPromo ? 'text-amber-400' : 'text-slate-500'
                }`}
              />
              <div>
                <div className="font-semibold text-white">2x Deposit Promo Offer</div>
                <div className="text-[11px] text-slate-400">
                  {user.hasDoubleBonusPromo
                    ? 'Active — every deposit gets a 100% matching bonus'
                    : 'Not activated (enter a valid promo code at login)'}
                </div>
              </div>
            </div>
            {user.hasDoubleBonusPromo && (
              <span className="font-mono font-bold text-emerald-400 tabular-nums">
                +{(user.totalBonus || 0).toFixed(0)} KES
              </span>
            )}
          </div>

          {stats && (
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-white/10 bg-[#0b0d12] p-3">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <TrendingUp className="h-3.5 w-3.5 text-violet-400" />
                  <span>Highest Cashout</span>
                </div>
                <div className="mt-1 font-mono text-base font-bold text-white tabular-nums">
                  {stats.biggestMultiplier > 0 ? `${stats.biggestMultiplier.toFixed(2)}x` : '—'}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0b0d12] p-3">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Award className="h-3.5 w-3.5 text-amber-400" />
                  <span>Biggest Win</span>
                </div>
                <div className="mt-1 font-mono text-base font-bold text-emerald-400 tabular-nums">
                  KES {stats.biggestPayout.toFixed(0)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0b0d12] p-3">
                <div className="text-slate-400">Flights Taken</div>
                <div className="mt-1 font-mono text-base font-bold text-white tabular-nums">
                  {stats.totalBets}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0b0d12] p-3">
                <div className="text-slate-400">Successful Cashouts</div>
                <div className="mt-1 font-mono text-base font-bold text-emerald-400 tabular-nums">
                  {stats.wins}
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenDeposit();
            }}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 transition-colors cursor-pointer"
          >
            Deposit via M-Pesa (Min KES 200)
          </button>
        </div>
      </div>
    </div>
  );
}
