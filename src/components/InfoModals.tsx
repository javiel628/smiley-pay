import { CheckCircle2, Plane, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RoundHistoryItem } from '../types';

interface FairnessModalProps {
  open: boolean;
  round: RoundHistoryItem | null;
  currentRoundCode: string;
  currentServerSeedHash: string;
  currentClientSeed: string;
  onClose: () => void;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function FairnessModal({
  open,
  round,
  currentRoundCode,
  currentServerSeedHash,
  currentClientSeed,
  onClose,
}: FairnessModalProps) {
  const [verifiedHash, setVerifiedHash] = useState<string | null>(null);

  useEffect(() => {
    if (open && round?.serverSeed) {
      sha256Hex(round.serverSeed).then(setVerifiedHash).catch(() => setVerifiedHash(null));
    } else {
      setVerifiedHash(null);
    }
  }, [open, round]);

  if (!open) return null;

  const hashMatches = round && verifiedHash ? verifiedHash === round.serverSeedHash : false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fairness-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#12161f] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 id="fairness-modal-title" className="font-display text-lg font-bold text-white">
                Provably Fair Odds Verification
              </h2>
              <p className="text-xs text-slate-400">
                BETKENYA 254 generates every round multiplier via cryptographic HMAC-SHA256.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close fairness modal"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#181d28] text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {round ? (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0b0d12] p-3.5">
              <div>
                <div className="text-slate-400">Round</div>
                <div className="font-mono text-sm font-bold text-white">{round.roundCode}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-400">Crash Result</div>
                <div className="font-mono text-lg font-extrabold text-rose-400">
                  {round.crashPoint.toFixed(2)}x
                </div>
              </div>
            </div>

            <div>
              <div className="mb-1 text-slate-400">Server Seed (Revealed after crash)</div>
              <div className="break-all rounded-lg border border-white/10 bg-[#0b0d12] p-2.5 font-mono text-[11px] text-slate-200">
                {round.serverSeed}
              </div>
            </div>

            <div>
              <div className="mb-1 text-slate-400">Pre-Round SHA-256 Commitment Hash</div>
              <div className="break-all rounded-lg border border-white/10 bg-[#0b0d12] p-2.5 font-mono text-[11px] text-slate-200">
                {round.serverSeedHash}
              </div>
            </div>

            <div>
              <div className="mb-1 text-slate-400">Client Seed</div>
              <div className="rounded-lg border border-white/10 bg-[#0b0d12] p-2.5 font-mono text-[11px] text-slate-200">
                {round.clientSeed}
              </div>
            </div>

            {verifiedHash && (
              <div
                className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 ${
                  hashMatches
                    ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                    : 'border-rose-500/40 bg-rose-950/40 text-rose-300'
                }`}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  {hashMatches
                    ? 'Verified: SHA-256(Server Seed) matches the pre-round commitment hash.'
                    : 'Hash mismatch.'}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-white/10 bg-[#0b0d12] p-3.5">
              <div className="text-slate-400">Current Active Round</div>
              <div className="mt-1 font-mono text-sm font-bold text-white">{currentRoundCode}</div>
            </div>

            <div>
              <div className="mb-1 text-slate-400">Pre-Round SHA-256 Server Seed Hash (Locked)</div>
              <div className="break-all rounded-lg border border-white/10 bg-[#0b0d12] p-2.5 font-mono text-[11px] text-slate-200">
                {currentServerSeedHash || 'Generating...'}
              </div>
            </div>

            <div>
              <div className="mb-1 text-slate-400">Client Seed</div>
              <div className="rounded-lg border border-white/10 bg-[#0b0d12] p-2.5 font-mono text-[11px] text-slate-200">
                {currentClientSeed || 'Generating...'}
              </div>
            </div>

            <p className="text-slate-400 leading-relaxed">
              Click any past multiplier pill above the flight stage to inspect its revealed Server Seed and verify its SHA-256 hash locally in your browser.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface HowToPlayModalProps {
  open: boolean;
  onClose: () => void;
}

export function HowToPlayModal({ open, onClose }: HowToPlayModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="howto-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#12161f] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
              <Plane className="h-5 w-5" />
            </div>
            <h2 id="howto-modal-title" className="font-display text-lg font-bold text-white">
              How to Play Aviator
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close how to play modal"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#181d28] text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ol className="space-y-3 text-sm text-slate-300">
          <li className="rounded-xl border border-white/10 bg-[#0b0d12] p-3">
            <span className="font-bold text-white">1. Fund Your Wallet:</span> Create your BETKENYA 254 account and deposit at least <span className="font-mono font-semibold text-emerald-400">KES 200</span> via M-Pesa, Airtel Money, or Card.
          </li>
          <li className="rounded-xl border border-white/10 bg-[#0b0d12] p-3">
            <span className="font-bold text-white">2. Place One or Two Bets:</span> Choose your stake (from KES 10) on Panel 1 and/or Panel 2 before takeoff, or enable Auto Cash Out.
          </li>
          <li className="rounded-xl border border-white/10 bg-[#0b0d12] p-3">
            <span className="font-bold text-white">3. Cash Out Before Fly-Away:</span> Watch the multiplier climb from <span className="font-mono text-white">1.00x</span> upwards. Tap <span className="font-semibold text-amber-400">CASH OUT</span> before the plane flies away to lock in your winnings.
          </li>
        </ol>

        <div className="mt-4 flex items-center justify-between rounded-lg border border-white/10 bg-[#181d28] px-3.5 py-2.5 text-xs text-slate-300">
          <span>Min Deposit: <strong className="font-mono text-white">KES 200</strong></span>
          <span>Min Withdrawal: <strong className="font-mono text-white">KES 100</strong></span>
        </div>
      </div>
    </div>
  );
}
