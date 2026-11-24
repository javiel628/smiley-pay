import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Gift,
  Loader2,
  RefreshCw,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { DarajaStatus, DepositUpdateEvent, PublicUser, WalletTransaction } from '../types';

interface WalletModalProps {
  open: boolean;
  initialTab: 'deposit' | 'withdraw' | 'history';
  token: string | null;
  user: PublicUser | null;
  lastDepositUpdate: DepositUpdateEvent | null;
  onClose: () => void;
  onUserUpdated: (user: PublicUser) => void;
}

const DEPOSIT_PRESETS = [200, 500, 1000, 2500, 5000];

export function WalletModal({
  open,
  initialTab,
  token,
  user,
  lastDepositUpdate,
  onClose,
  onUserUpdated,
}: WalletModalProps) {
  const [tab, setTab] = useState<'deposit' | 'withdraw' | 'history'>(initialTab);
  const [depositAmount, setDepositAmount] = useState('200');
  const [depositPhone, setDepositPhone] = useState(user?.phone || '');
  const [darajaStatus, setDarajaStatus] = useState<DarajaStatus | null>(null);
  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const [withdrawMethod, setWithdrawMethod] = useState<'MPESA' | 'AIRTEL'>('MPESA');
  const [withdrawAmount, setWithdrawAmount] = useState('100');
  const [withdrawPhone, setWithdrawPhone] = useState(user?.phone || '');

  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
    setError(null);
    setSuccessMsg(null);
  }, [initialTab, open]);

  useEffect(() => {
    if (user?.phone) {
      setDepositPhone((prev) => prev || user.phone);
      setWithdrawPhone((prev) => prev || user.phone);
    }
  }, [user?.phone]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/wallet/daraja-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DarajaStatus | null) => {
        if (data) setDarajaStatus(data);
      })
      .catch(() => {});
  }, [open]);

  const fetchTransactions = useCallback(async () => {
    if (!token) return;
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/wallet/transactions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { transactions: WalletTransaction[] };
        setTransactions(data.transactions || []);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [token]);

  useEffect(() => {
    if (open && tab === 'history' && token) {
      fetchTransactions();
    }
  }, [open, tab, token, fetchTransactions]);

  // Apply real-time WebSocket deposit update from Safaricom callback
  useEffect(() => {
    if (!lastDepositUpdate || !pendingCheckoutId) return;
    if (lastDepositUpdate.checkoutRequestId !== pendingCheckoutId) return;

    if (lastDepositUpdate.status === 'COMPLETED') {
      setPendingCheckoutId(null);
      setPendingMessage(null);
      if (lastDepositUpdate.user) {
        onUserUpdated(lastDepositUpdate.user);
      }
      const depAmt = lastDepositUpdate.transaction?.amount || 0;
      const bonus = lastDepositUpdate.bonusAwarded || 0;
      setSuccessMsg(
        bonus > 0
          ? `M-Pesa deposit of KES ${depAmt.toFixed(2)} + KES ${bonus.toFixed(2)} 2x Bonus credited (Total KES ${(depAmt + bonus).toFixed(2)})!`
          : `M-Pesa deposit of KES ${depAmt.toFixed(2)} confirmed (Receipt: ${lastDepositUpdate.transaction?.reference}).`,
      );
    } else if (lastDepositUpdate.status === 'FAILED') {
      setPendingCheckoutId(null);
      setPendingMessage(null);
      setError(
        lastDepositUpdate.transaction?.result_desc || 'M-Pesa payment was cancelled or failed.',
      );
    }
  }, [lastDepositUpdate, pendingCheckoutId, onUserUpdated]);

  const checkStkStatus = useCallback(
    async (checkoutId: string, silent = false) => {
      if (!token) return;
      if (!silent) setCheckingStatus(true);
      try {
        const res = await fetch(`/api/wallet/deposit/status/${encodeURIComponent(checkoutId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as {
          status?: 'PENDING' | 'COMPLETED' | 'FAILED';
          bonusAwarded?: number;
          transaction?: WalletTransaction;
          user?: PublicUser;
          error?: string;
        };
        if (data.status === 'COMPLETED') {
          setPendingCheckoutId(null);
          setPendingMessage(null);
          if (data.user) onUserUpdated(data.user);
          const depAmt = data.transaction?.amount || 0;
          const bonus = data.bonusAwarded || 0;
          setSuccessMsg(
            bonus > 0
              ? `M-Pesa deposit of KES ${depAmt.toFixed(2)} + KES ${bonus.toFixed(2)} 2x Bonus credited (Total KES ${(depAmt + bonus).toFixed(2)})!`
              : `M-Pesa deposit of KES ${depAmt.toFixed(2)} confirmed (Receipt: ${data.transaction?.reference}).`,
          );
        } else if (data.status === 'FAILED') {
          setPendingCheckoutId(null);
          setPendingMessage(null);
          setError(
            data.error ||
              data.transaction?.result_desc ||
              'M-Pesa transaction was not completed.',
          );
        }
      } catch {
        // Ignore transient polling failures
      } finally {
        if (!silent) setCheckingStatus(false);
      }
    },
    [token, onUserUpdated],
  );

  // Auto-poll Safaricom STK Push status every 3.5 seconds while waiting for PIN confirmation
  useEffect(() => {
    if (!open || !pendingCheckoutId || !token) return;
    const interval = setInterval(() => {
      checkStkStatus(pendingCheckoutId, true);
    }, 3500);
    return () => clearInterval(interval);
  }, [open, pendingCheckoutId, token, checkStkStatus]);

  if (!open || !user || !token) return null;

  const parsedDepositInt = Math.round(Number(depositAmount) || 0);

  const handleDeposit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const amt = Math.round(Number(depositAmount));
    if (!Number.isFinite(amt) || amt < 200) {
      setError('Minimum deposit is KES 200.');
      return;
    }

    setSubmitting(true);
    try {
      const sendDeposit = async () => {
        const res = await fetch('/api/wallet/deposit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount: amt,
            phone: depositPhone,
          }),
        });
        const raw = await res.text();
        return { res, raw };
      };

      type DepositResponse = {
        status?: string;
        checkoutRequestId?: string;
        customerMessage?: string;
        error?: string;
      };
      const tryParse = (txt: string): DepositResponse | null => {
        try {
          return JSON.parse(txt) as DepositResponse;
        } catch {
          return null;
        }
      };

      let { res, raw } = await sendDeposit();
      let data = tryParse(raw);

      if (!data) {
        await new Promise((r) => setTimeout(r, 1200));
        ({ res, raw } = await sendDeposit());
        data = tryParse(raw);
      }

      if (!data) {
        const isHtml = /<!doctype|<html/i.test(raw);
        setError(
          isHtml
            ? `Preview session returned an HTML page (HTTP ${res.status}) instead of the payment API. Please refresh this browser page and try again.`
            : `Unexpected non-JSON response (HTTP ${res.status}). Please refresh and try again.`,
        );
        return;
      }

      if (!res.ok || !data.checkoutRequestId) {
        setError(data.error || `Could not initiate M-Pesa STK Push (HTTP ${res.status}).`);
        return;
      }

      setPendingCheckoutId(data.checkoutRequestId);
      setPendingMessage(
        data.customerMessage || 'M-Pesa prompt sent to your phone. Enter your M-Pesa PIN to complete.',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection interrupted';
      setError(`Could not reach payment server (${msg}). Please try again.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const amt = Number(withdrawAmount);
    if (!Number.isFinite(amt) || amt < 100) {
      setError('Minimum withdrawal is KES 100.');
      return;
    }
    if (amt > user.balance) {
      setError(`Insufficient balance. Available: KES ${user.balance.toFixed(2)}.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: amt,
          method: withdrawMethod,
          phone: withdrawPhone,
        }),
      });
      const data = (await res.json()) as {
        user?: PublicUser;
        transaction?: WalletTransaction;
        error?: string;
      };
      if (!res.ok || !data.user) {
        setError(data.error || 'Withdrawal failed.');
        return;
      }
      onUserUpdated(data.user);
      setSuccessMsg(
        `Withdrawal of KES ${amt.toFixed(2)} sent to ${data.transaction?.phone_or_ref} (Ref: ${data.transaction?.reference}).`,
      );
    } catch {
      setError('Network error while processing withdrawal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#12161f] p-6 shadow-2xl max-h-[92vh] overflow-y-auto arena-scroll">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h2 id="wallet-modal-title" className="font-display text-lg font-bold text-white">
                BETKENYA 254 Cashier
              </h2>
              <p className="font-mono text-xs text-emerald-400 tabular-nums">
                Balance: KES {user.balance.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close wallet modal"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#181d28] text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-5 grid grid-cols-3 gap-1 rounded-lg bg-[#0b0d12] p-1 border border-white/5">
          <button
            type="button"
            onClick={() => {
              setTab('deposit');
              setError(null);
              setSuccessMsg(null);
            }}
            className={`rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
              tab === 'deposit' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('withdraw');
              setError(null);
              setSuccessMsg(null);
            }}
            className={`rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
              tab === 'withdraw' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Withdraw
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('history');
              setError(null);
              setSuccessMsg(null);
            }}
            className={`rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
              tab === 'history' ? 'bg-[#222836] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            History
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-950/50 px-3.5 py-2.5 text-xs font-medium text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-3.5 py-2.5 text-xs font-medium text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {tab === 'deposit' && (
          <>
            {user.hasDoubleBonusPromo && (
              <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber-500/35 bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-200">
                <Gift className="h-4 w-4 shrink-0 text-amber-400" />
                <span>
                  <strong className="text-amber-100">2x Deposit Bonus Active:</strong> Deposit{' '}
                  <span className="font-mono font-semibold text-white">
                    KES {Math.max(200, parsedDepositInt)}
                  </span>{' '}
                  and receive{' '}
                  <span className="font-mono font-semibold text-emerald-300">
                    KES {(Math.max(200, parsedDepositInt) * 2).toLocaleString()}
                  </span>{' '}
                  total in your account!
                </span>
              </div>
            )}

            {darajaStatus && !darajaStatus.configured && (
              <div className="mb-4 rounded-xl border border-amber-500/35 bg-amber-950/30 p-3.5 text-xs text-amber-200 space-y-1.5">
                <div className="font-semibold text-amber-100">
                  Safaricom Daraja Keys Required
                </div>
                <p className="leading-relaxed text-amber-200/90">
                  Add your Safaricom Daraja credentials in Settings → Secrets to activate real M-Pesa STK Push deposits:
                </p>
                <div className="font-mono text-[11px] text-amber-100">
                  {darajaStatus.missingSecrets.join(', ')}
                </div>
              </div>
            )}

            {pendingCheckoutId ? (
              <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-[#0b0d12] p-5 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-white">
                    Confirm M-Pesa PIN on Your Phone
                  </h3>
                  <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                    {pendingMessage}
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-slate-500">
                    Request ID: {pendingCheckoutId}
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={checkingStatus}
                    onClick={() => checkStkStatus(pendingCheckoutId, false)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
                    <span>{checkingStatus ? 'Checking...' : 'Check Payment Status'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingCheckoutId(null);
                      setPendingMessage(null);
                    }}
                    className="rounded-lg border border-white/10 bg-[#181d28] px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                  >
                    New Request
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleDeposit} className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0b0d12] px-3.5 py-2.5 text-xs text-slate-300">
                  <span>
                    Safaricom M-Pesa Express · Min{' '}
                    <strong className="font-mono text-white">KES 200</strong>
                  </span>
                  <span className="font-mono text-[11px] text-emerald-400">
                    {darajaStatus?.env === 'production' ? 'Live Daraja' : 'Daraja Sandbox'}
                  </span>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Safaricom M-Pesa Number
                  </label>
                  <div className="relative">
                    <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      type="tel"
                      required
                      value={depositPhone}
                      onChange={(e) => setDepositPhone(e.target.value)}
                      placeholder="+254712345678"
                      className="w-full rounded-lg border border-white/10 bg-[#0b0d12] py-2.5 pl-9 pr-3 font-mono text-sm text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Deposit Amount (Whole KES, Min 200)
                  </label>
                  <input
                    type="number"
                    required
                    min={200}
                    max={500000}
                    step={1}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#0b0d12] px-3.5 py-2.5 font-mono text-base font-bold text-white tabular-nums focus:border-emerald-500 focus:outline-none"
                  />
                  <div className="mt-2 grid grid-cols-5 gap-1.5">
                    {DEPOSIT_PRESETS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setDepositAmount(String(amt))}
                        className="rounded-md border border-white/10 bg-[#181d28] py-1.5 font-mono text-xs font-semibold text-slate-300 hover:text-white cursor-pointer tabular-nums"
                      >
                        {amt}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {submitting
                    ? 'Sending M-Pesa Prompt...'
                    : `Deposit KES ${Math.round(Number(depositAmount || 0))} via M-Pesa`}
                </button>
              </form>
            )}
          </>
        )}

        {tab === 'withdraw' && (
          <form onSubmit={handleWithdraw} className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-[#0b0d12] px-3.5 py-2.5 text-xs text-slate-300">
              Minimum withdrawal is <span className="font-mono font-bold text-white">KES 100</span>. Payouts are sent directly to your Kenyan mobile wallet.
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Payout Network
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['MPESA', 'AIRTEL'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setWithdrawMethod(m)}
                    className={`rounded-lg border py-2 text-xs font-semibold transition-colors cursor-pointer ${
                      withdrawMethod === m
                        ? 'border-rose-500 bg-rose-500/15 text-rose-300'
                        : 'border-white/10 bg-[#0b0d12] text-slate-400 hover:text-white'
                    }`}
                  >
                    {m === 'MPESA' ? 'M-Pesa' : 'Airtel Money'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Recipient Phone Number
              </label>
              <div className="relative">
                <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="tel"
                  required
                  value={withdrawPhone}
                  onChange={(e) => setWithdrawPhone(e.target.value)}
                  placeholder="+254712345678"
                  className="w-full rounded-lg border border-white/10 bg-[#0b0d12] py-2.5 pl-9 pr-3 font-mono text-sm text-white focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <label className="font-medium text-slate-300">
                  Withdraw Amount (Min KES 100)
                </label>
                <button
                  type="button"
                  onClick={() => setWithdrawAmount(String(Math.floor(user.balance)))}
                  className="font-mono text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  Max: {user.balance.toFixed(0)} KES
                </button>
              </div>
              <input
                type="number"
                required
                min={100}
                max={300000}
                step={1}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0b0d12] px-3.5 py-2.5 font-mono text-base font-bold text-white tabular-nums focus:border-rose-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-rose-600 py-3 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {submitting ? 'Processing Payout...' : `Withdraw KES ${Number(withdrawAmount || 0).toFixed(2)}`}
            </button>
          </form>
        )}

        {tab === 'history' && (
          <div className="max-h-80 overflow-y-auto arena-scroll space-y-2">
            {loadingHistory ? (
              <p className="py-10 text-center text-xs text-slate-400">Loading transactions...</p>
            ) : transactions.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">
                No deposits, bonuses, or withdrawals recorded yet.
              </p>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0b0d12] px-3.5 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {tx.type === 'BONUS' ? (
                      <Gift className="h-4 w-4 text-amber-400 shrink-0" />
                    ) : tx.type === 'DEPOSIT' ? (
                      <ArrowDownLeft className="h-4 w-4 text-emerald-400 shrink-0" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-rose-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-white">
                        {tx.type === 'BONUS'
                          ? '2x Deposit Bonus'
                          : tx.type === 'DEPOSIT'
                          ? 'Deposit'
                          : 'Withdrawal'}{' '}
                        · {tx.method} ·{' '}
                        <span
                          className={
                            tx.status === 'COMPLETED'
                              ? 'text-emerald-400'
                              : tx.status === 'PENDING'
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }
                        >
                          {tx.status}
                        </span>
                      </div>
                      <div className="truncate font-mono text-[11px] text-slate-400">
                        {tx.reference} · {tx.phone_or_ref}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div
                      className={`font-mono font-bold tabular-nums ${
                        tx.type === 'BONUS'
                          ? 'text-amber-400'
                          : tx.type === 'DEPOSIT'
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {tx.type === 'WITHDRAWAL' ? '-' : '+'}KES {tx.amount.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {new Date(tx.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
