import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  hashPassword,
  isValidEmail,
  normalizeKenyanPhone,
  requireAuth,
  signAuthToken,
  verifyAuthToken,
  verifyPassword,
  type AuthenticatedRequest,
} from './server/auth.ts';
import { AviatorEngine } from './server/aviatorEngine.ts';
import {
  getDarajaPublicStatus,
  initiateStkPush,
  loadDarajaConfig,
  queryStkPushStatus,
  verifyCallbackSecret,
} from './server/daraja.ts';
import {
  db,
  toPublicUser,
  type BetRow,
  type ChatMessageRow,
  type TransactionRow,
  type UserRow,
} from './server/db.ts';

dotenv.config();

const DOUBLE_BONUS_PROMO_CODE = 'SMILEY';

function validateOptionalPromo(raw?: string):
  | { ok: true; applied: string | null }
  | { ok: false; error: string } {
  const cleaned = (raw || '').trim();
  if (!cleaned) return { ok: true, applied: null };
  if (cleaned.toUpperCase() === DOUBLE_BONUS_PROMO_CODE) {
    return { ok: true, applied: DOUBLE_BONUS_PROMO_CODE };
  }
  return { ok: false, error: 'Invalid promo code.' };
}

const chatRateLimits = new Map<string, number>();

const MIN_DEPOSIT_KES = 200;
const MAX_DEPOSIT_KES = 500000;
const MIN_WITHDRAWAL_KES = 100;
const MAX_WITHDRAWAL_KES = 300000;

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const engine = new AviatorEngine();

  wss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url || '/ws', 'http://localhost');
    const token = reqUrl.searchParams.get('token');
    const userId = token ? verifyAuthToken(token) : null;
    engine.registerClient(ws, userId);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { event?: string; token?: string };
        if (msg.event === 'auth:update') {
          const nextUserId = msg.token ? verifyAuthToken(msg.token) : null;
          engine.updateClientAuth(ws, nextUserId);
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    ws.on('close', () => {
      engine.unregisterClient(ws);
    });
  });

  // --- Authentication Routes ---
  app.post('/api/auth/register', (req, res) => {
    const { fullName, phone, email, password, promoCode } = req.body as {
      fullName?: string;
      phone?: string;
      email?: string;
      password?: string;
      promoCode?: string;
    };

    const cleanName = (fullName || '').trim();
    if (cleanName.length < 2 || cleanName.length > 60) {
      res.status(400).json({ error: 'Full name must be between 2 and 60 characters.' });
      return;
    }

    const normalizedPhone = normalizeKenyanPhone(phone || '');
    if (!normalizedPhone) {
      res.status(400).json({
        error: 'Enter a valid Kenyan phone number (e.g. 0712345678 or +254712345678).',
      });
      return;
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const promoCheck = validateOptionalPromo(promoCode);
    if (!promoCheck.ok) {
      res.status(400).json({ error: promoCheck.error });
      return;
    }

    const existing = db
      .prepare('SELECT id, phone, email FROM users WHERE phone = ? OR email = ?')
      .get(normalizedPhone, cleanEmail) as { id: string; phone: string; email: string } | undefined;

    if (existing) {
      if (existing.phone === normalizedPhone) {
        res.status(409).json({ error: 'An account with this phone number already exists.' });
        return;
      }
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    const userId = crypto.randomUUID();
    const passwordHash = hashPassword(password);
    const createdAt = new Date().toISOString();

    db.prepare(
      `INSERT INTO users (id, full_name, phone, email, password_hash, balance, has_deposited, promo_code, total_bonus, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, 0, ?)`,
    ).run(userId, cleanName, normalizedPhone, cleanEmail, passwordHash, promoCheck.applied, createdAt);

    const createdUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
    const token = signAuthToken(userId);

    res.status(201).json({
      token,
      user: toPublicUser(createdUser),
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { identifier, password, promoCode } = req.body as {
      identifier?: string;
      password?: string;
      promoCode?: string;
    };

    const rawId = (identifier || '').trim();
    if (!rawId || !password) {
      res.status(400).json({ error: 'Phone/email and password are required.' });
      return;
    }

    const normalizedPhone = normalizeKenyanPhone(rawId);
    const emailCandidate = rawId.toLowerCase();

    let user = normalizedPhone
      ? (db.prepare('SELECT * FROM users WHERE phone = ?').get(normalizedPhone) as UserRow | undefined)
      : (db.prepare('SELECT * FROM users WHERE email = ?').get(emailCandidate) as UserRow | undefined);

    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid phone/email or password.' });
      return;
    }

    const promoCheck = validateOptionalPromo(promoCode);
    if (!promoCheck.ok) {
      res.status(400).json({ error: promoCheck.error });
      return;
    }

    if (promoCheck.applied && user.promo_code !== promoCheck.applied) {
      db.prepare('UPDATE users SET promo_code = ? WHERE id = ?').run(promoCheck.applied, user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRow;
    }

    const token = signAuthToken(user.id);
    res.json({
      token,
      user: toPublicUser(user),
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as UserRow | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({ user: toPublicUser(user) });
  });

  // Idempotent settlement helper used by both Safaricom callback and STK Push query
  const settleDeposit = (
    checkoutRequestId: string,
    mpesaReceipt: string,
    resultDesc: string,
    paidAmount?: number,
  ) => {
    const txResult = db.transaction(() => {
      const existing = db
        .prepare('SELECT * FROM transactions WHERE checkout_request_id = ?')
        .get(checkoutRequestId) as TransactionRow | undefined;

      if (!existing) return { found: false as const };
      if (existing.status === 'COMPLETED') {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.user_id) as UserRow;
        return { found: true as const, alreadySettled: true, transaction: existing, user };
      }
      if (existing.status !== 'PENDING') {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.user_id) as UserRow;
        return { found: true as const, alreadySettled: true, transaction: existing, user };
      }

      if (typeof paidAmount === 'number' && (!Number.isFinite(paidAmount) || paidAmount < MIN_DEPOSIT_KES)) {
        const nowIso = new Date().toISOString();
        db.prepare(
          `UPDATE transactions SET status = 'FAILED', result_desc = ?, updated_at = ? WHERE checkout_request_id = ? AND status = 'PENDING'`,
        ).run('Paid amount below minimum deposit.', nowIso, checkoutRequestId);
        const failedTx = db
          .prepare('SELECT * FROM transactions WHERE checkout_request_id = ?')
          .get(checkoutRequestId) as TransactionRow;
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.user_id) as UserRow;
        return { found: true as const, alreadySettled: true, transaction: failedTx, user };
      }

      const creditAmount =
        typeof paidAmount === 'number' ? Math.round(paidAmount * 100) / 100 : existing.amount;

      const nowIso = new Date().toISOString();
      const updated = db
        .prepare(
          `UPDATE transactions
           SET status = 'COMPLETED', reference = ?, result_desc = ?, amount = ?, updated_at = ?
           WHERE checkout_request_id = ? AND status = 'PENDING'`,
        )
        .run(mpesaReceipt, resultDesc, creditAmount, nowIso, checkoutRequestId);

      let bonusAmount = 0;
      if (updated.changes === 1) {
        const userBefore = db
          .prepare('SELECT * FROM users WHERE id = ?')
          .get(existing.user_id) as UserRow;
        if (userBefore.promo_code === DOUBLE_BONUS_PROMO_CODE) {
          bonusAmount = creditAmount;
        }
        const totalCredit = Math.round((creditAmount + bonusAmount) * 100) / 100;

        db.prepare(
          'UPDATE users SET balance = ROUND(balance + ?, 2), has_deposited = 1, total_bonus = ROUND(total_bonus + ?, 2) WHERE id = ?',
        ).run(totalCredit, bonusAmount, existing.user_id);

        if (bonusAmount > 0) {
          db.prepare(
            `INSERT INTO transactions
              (id, user_id, type, method, phone_or_ref, amount, reference, status, result_desc, created_at)
             VALUES (?, ?, 'BONUS', 'PROMO', ?, ?, ?, 'COMPLETED', ?, ?)`,
          ).run(
            crypto.randomUUID(),
            existing.user_id,
            existing.phone_or_ref,
            bonusAmount,
            `BNS-${mpesaReceipt.slice(-6)}`,
            '100% Double Deposit Promo Bonus',
            nowIso,
          );
        }
      }

      const finalTx = db
        .prepare('SELECT * FROM transactions WHERE checkout_request_id = ?')
        .get(checkoutRequestId) as TransactionRow;
      const finalUser = db
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(existing.user_id) as UserRow;

      return {
        found: true as const,
        alreadySettled: false,
        bonusAmount,
        transaction: finalTx,
        user: finalUser,
      };
    })();

    if (txResult.found && !txResult.alreadySettled) {
      engine.notifyUserBalance(txResult.user.id);
      engine.pushUserEvent(txResult.user.id, 'wallet:deposit_update', {
        status: 'COMPLETED',
        checkoutRequestId,
        bonusAwarded: txResult.bonusAmount,
        transaction: txResult.transaction,
        user: toPublicUser(txResult.user),
      });
    }
    return txResult;
  };

  const failDeposit = (checkoutRequestId: string, resultDesc: string) => {
    const nowIso = new Date().toISOString();
    const existing = db
      .prepare('SELECT * FROM transactions WHERE checkout_request_id = ?')
      .get(checkoutRequestId) as TransactionRow | undefined;

    if (!existing || existing.status !== 'PENDING') return existing ?? null;

    db.prepare(
      `UPDATE transactions
       SET status = 'FAILED', result_desc = ?, updated_at = ?
       WHERE checkout_request_id = ? AND status = 'PENDING'`,
    ).run(resultDesc, nowIso, checkoutRequestId);

    const updated = db
      .prepare('SELECT * FROM transactions WHERE checkout_request_id = ?')
      .get(checkoutRequestId) as TransactionRow;

    engine.pushUserEvent(existing.user_id, 'wallet:deposit_update', {
      status: 'FAILED',
      checkoutRequestId,
      transaction: updated,
    });
    return updated;
  };

  // --- Wallet Routes (Safaricom Daraja STK Push Deposit Min 200 KES, Withdrawal Min 100 KES) ---
  app.get('/api/wallet/daraja-status', (_req, res) => {
    res.json(getDarajaPublicStatus());
  });

  app.post('/api/wallet/deposit', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { amount, phone } = req.body as {
      amount?: number;
      phone?: string;
    };

    const numericAmount = Math.round(Number(amount));
    if (!Number.isFinite(numericAmount) || numericAmount < MIN_DEPOSIT_KES) {
      res.status(400).json({
        error: `Minimum deposit is KES ${MIN_DEPOSIT_KES}.`,
      });
      return;
    }
    if (numericAmount > MAX_DEPOSIT_KES) {
      res.status(400).json({
        error: `Maximum single deposit is KES ${MAX_DEPOSIT_KES.toLocaleString()}.`,
      });
      return;
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as
      | UserRow
      | undefined;
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    const normalizedPhone = normalizeKenyanPhone((phone || user.phone).trim());
    if (!normalizedPhone) {
      res.status(400).json({
        error: 'Enter a valid Safaricom M-Pesa number (e.g. 0712345678 or +254712345678).',
      });
      return;
    }

    const darajaStatus = getDarajaPublicStatus();
    if (!darajaStatus.configured) {
      res.status(422).json({
        code: 'DARAJA_NOT_CONFIGURED',
        missingSecrets: darajaStatus.missingSecrets,
        error: `Safaricom Daraja credentials are not configured yet (${darajaStatus.missingSecrets.join(', ')}). Configure them in Settings -> Secrets to enable real M-Pesa STK Push deposits.`,
      });
      return;
    }

    try {
      const host = req.get('x-forwarded-host') || req.get('host');
      const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
      const fallbackOrigin = host ? `${proto}://${host}` : undefined;
      const config = loadDarajaConfig(fallbackOrigin);

      const stk = await initiateStkPush(config, {
        phonePlus254: normalizedPhone,
        amountKes: numericAmount,
        accountReference: 'BETKENYA254',
        description: 'Aviator Dep',
      });

      const txId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      db.prepare(
        `INSERT INTO transactions
          (id, user_id, type, method, phone_or_ref, amount, reference, status, merchant_request_id, checkout_request_id, result_desc, created_at)
         VALUES (?, ?, 'DEPOSIT', 'MPESA', ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
      ).run(
        txId,
        user.id,
        normalizedPhone,
        numericAmount,
        stk.CheckoutRequestID,
        stk.MerchantRequestID,
        stk.CheckoutRequestID,
        stk.CustomerMessage || 'STK Push sent. Enter M-Pesa PIN on your phone.',
        createdAt,
      );

      const transaction = db
        .prepare('SELECT * FROM transactions WHERE id = ?')
        .get(txId) as TransactionRow;

      res.status(202).json({
        status: 'PENDING',
        checkoutRequestId: stk.CheckoutRequestID,
        customerMessage:
          stk.CustomerMessage || 'Success. Request accepted for processing. Check your phone.',
        transaction,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initiate M-Pesa STK Push.';
      res.status(422).json({ error: message });
    }
  });

  app.get(
    '/api/wallet/deposit/status/:checkoutRequestId',
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      const checkoutRequestId = String(req.params.checkoutRequestId || '').trim();
      if (!checkoutRequestId) {
        res.status(400).json({ error: 'CheckoutRequestID is required.' });
        return;
      }

      const tx = db
        .prepare('SELECT * FROM transactions WHERE checkout_request_id = ? AND user_id = ?')
        .get(checkoutRequestId, req.userId) as TransactionRow | undefined;

      if (!tx) {
        res.status(404).json({ error: 'Deposit transaction not found.' });
        return;
      }

      if (tx.status === 'COMPLETED' || tx.status === 'FAILED') {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as UserRow;
        res.json({
          status: tx.status,
          transaction: tx,
          user: toPublicUser(user),
        });
        return;
      }

      // Query Safaricom Daraja STK Push status directly if callback hasn't arrived yet
      try {
        const host = req.get('x-forwarded-host') || req.get('host');
        const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
        const fallbackOrigin = host ? `${proto}://${host}` : undefined;
        const config = loadDarajaConfig(fallbackOrigin);
        const queryRes = await queryStkPushStatus(config, checkoutRequestId);

        if (String(queryRes.ResultCode) === '0') {
          const settled = settleDeposit(
            checkoutRequestId,
            tx.reference,
            queryRes.ResultDesc || 'Confirmed via M-Pesa STK Query',
          );
          if (settled.found) {
            res.json({
              status: 'COMPLETED',
              bonusAwarded: 'bonusAmount' in settled ? settled.bonusAmount : 0,
              transaction: settled.transaction,
              user: toPublicUser(settled.user),
            });
            return;
          }
        } else if (queryRes.ResultCode && String(queryRes.ResultCode) !== '0') {
          const failedTx = failDeposit(
            checkoutRequestId,
            queryRes.ResultDesc || 'M-Pesa payment was not completed.',
          );
          res.json({
            status: 'FAILED',
            transaction: failedTx,
            error: queryRes.ResultDesc || 'M-Pesa payment was cancelled or failed.',
          });
          return;
        }
      } catch {
        // Daraja returns an error while the customer is still entering their PIN; stay PENDING
      }

      res.json({ status: 'PENDING', transaction: tx });
    },
  );

  // Public Safaricom Daraja STK Push Callback Webhook
  app.post('/api/mpesa/callback', (req, res) => {
    const providedSecret =
      typeof req.query.secret === 'string' ? req.query.secret : undefined;
    if (!verifyCallbackSecret(providedSecret)) {
      res.status(401).json({ ResultCode: 1, ResultDesc: 'Unauthorized callback secret' });
      return;
    }

    const body = req.body as {
      Body?: {
        stkCallback?: {
          MerchantRequestID?: string;
          CheckoutRequestID?: string;
          ResultCode?: number;
          ResultDesc?: string;
          CallbackMetadata?: {
            Item?: Array<{ Name?: string; Value?: string | number }>;
          };
        };
      };
    };

    const stkCallback = body?.Body?.stkCallback;
    if (!stkCallback?.CheckoutRequestID) {
      res.status(400).json({ ResultCode: 1, ResultDesc: 'Invalid STK callback payload' });
      return;
    }

    const checkoutId = stkCallback.CheckoutRequestID;
    const resultCode = Number(stkCallback.ResultCode);
    const resultDesc = stkCallback.ResultDesc || '';

    if (resultCode === 0) {
      const items = stkCallback.CallbackMetadata?.Item || [];
      const receiptItem = items.find((i) => i.Name === 'MpesaReceiptNumber');
      const amountItem = items.find((i) => i.Name === 'Amount');
      const receipt = receiptItem?.Value ? String(receiptItem.Value) : checkoutId;
      const paidAmount = amountItem?.Value !== undefined ? Number(amountItem.Value) : undefined;

      settleDeposit(checkoutId, receipt, resultDesc || 'M-Pesa payment confirmed', paidAmount);
    } else {
      failDeposit(checkoutId, resultDesc || `M-Pesa transaction failed (code ${resultCode})`);
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  app.post('/api/wallet/withdraw', requireAuth, (req: AuthenticatedRequest, res) => {
    const { amount, method, phone } = req.body as {
      amount?: number;
      method?: string;
      phone?: string;
    };

    const numericAmount = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(numericAmount) || numericAmount < MIN_WITHDRAWAL_KES) {
      res.status(400).json({
        error: `Minimum withdrawal is KES ${MIN_WITHDRAWAL_KES}.`,
      });
      return;
    }
    if (numericAmount > MAX_WITHDRAWAL_KES) {
      res.status(400).json({
        error: `Maximum single withdrawal is KES ${MAX_WITHDRAWAL_KES.toLocaleString()}.`,
      });
      return;
    }

    const cleanMethod = (method || 'MPESA').toUpperCase();
    if (!['MPESA', 'AIRTEL'].includes(cleanMethod)) {
      res.status(400).json({ error: 'Withdrawals support M-Pesa or Airtel Money.' });
      return;
    }

    const withdrawTx = db.transaction(() => {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as
        | UserRow
        | undefined;
      if (!user) return { error: 'Account not found.', status: 404 as const };

      if (user.has_deposited !== 1) {
        return {
          error: 'Make at least one deposit (min KES 200) before requesting a withdrawal.',
          status: 403 as const,
        };
      }

      if (user.balance < numericAmount) {
        return {
          error: `Insufficient balance. Available: KES ${user.balance.toFixed(2)}.`,
          status: 400 as const,
        };
      }

      const normalizedPhone = normalizeKenyanPhone(phone || user.phone);
      if (!normalizedPhone) {
        return {
          error: 'Enter a valid Kenyan phone number (e.g. +254712345678).',
          status: 400 as const,
        };
      }

      db.prepare('UPDATE users SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(
        numericAmount,
        user.id,
      );

      const txId = crypto.randomUUID();
      const reference = `WD${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const createdAt = new Date().toISOString();

      db.prepare(
        `INSERT INTO transactions (id, user_id, type, method, phone_or_ref, amount, reference, status, created_at)
         VALUES (?, ?, 'WITHDRAWAL', ?, ?, ?, ?, 'COMPLETED', ?)`,
      ).run(txId, user.id, cleanMethod, normalizedPhone, numericAmount, reference, createdAt);

      const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRow;
      const transaction = db
        .prepare('SELECT * FROM transactions WHERE id = ?')
        .get(txId) as TransactionRow;

      return { user: toPublicUser(updatedUser), transaction };
    });

    const result = withdrawTx();
    if ('error' in result) {
      res.status(result.status ?? 400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.get('/api/wallet/transactions', requireAuth, (req: AuthenticatedRequest, res) => {
    const rows = db
      .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(req.userId) as TransactionRow[];
    res.json({ transactions: rows });
  });

  // --- Game API Routes ---
  app.get('/api/game/history', (_req, res) => {
    res.json({ rounds: engine.getRecentRounds(32) });
  });

  app.get('/api/game/my-bets', requireAuth, (req: AuthenticatedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT b.*, r.round_code, r.crash_point
         FROM bets b
         JOIN rounds r ON b.round_id = r.id
         WHERE b.user_id = ?
         ORDER BY b.created_at DESC
         LIMIT 50`,
      )
      .all(req.userId) as Array<BetRow & { round_code: string; crash_point: number }>;

    res.json({
      bets: rows.map((r) => ({
        id: r.id,
        roundCode: r.round_code,
        crashPoint: r.crash_point,
        panel: r.panel,
        stake: r.stake,
        cashoutMultiplier: r.cashout_multiplier,
        payout: r.payout,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  });

  app.get('/api/game/top-wins', (_req, res) => {
    const payoutRows = db
      .prepare(
        `SELECT b.*, r.round_code, r.crash_point
         FROM bets b
         JOIN rounds r ON b.round_id = r.id
         WHERE b.status = 'CASHED_OUT' AND b.payout > 0
         ORDER BY b.payout DESC
         LIMIT 25`,
      )
      .all() as Array<BetRow & { round_code: string; crash_point: number }>;

    const multRows = db
      .prepare(
        `SELECT b.*, r.round_code, r.crash_point
         FROM bets b
         JOIN rounds r ON b.round_id = r.id
         WHERE b.status = 'CASHED_OUT' AND b.cashout_multiplier IS NOT NULL
         ORDER BY b.cashout_multiplier DESC
         LIMIT 25`,
      )
      .all() as Array<BetRow & { round_code: string; crash_point: number }>;

    const mapWin = (r: BetRow & { round_code: string; crash_point: number }) => {
      const first = (r.user_name || 'Player').split(/\s+/)[0];
      const masked = first.length <= 2 ? `${first}***` : `${first.slice(0, 2)}***${first.slice(-1)}`;
      return {
        id: r.id,
        userName: masked,
        roundCode: r.round_code,
        stake: r.stake,
        cashoutMultiplier: r.cashout_multiplier,
        payout: r.payout,
        createdAt: r.created_at,
      };
    };

    const arenaWins = engine.getArenaLeaderboard();

    const combinedWins = [...payoutRows.map(mapWin), ...arenaWins]
      .sort((a, b) => b.payout - a.payout)
      .slice(0, 25);

    const combinedMultipliers = [...multRows.map(mapWin), ...arenaWins]
      .sort((a, b) => (b.cashoutMultiplier || 0) - (a.cashoutMultiplier || 0))
      .slice(0, 25);

    res.json({
      topWins: combinedWins,
      topMultipliers: combinedMultipliers,
    });
  });

  app.get('/api/game/my-stats', requireAuth, (req: AuthenticatedRequest, res) => {
    const agg = db
      .prepare(
        `SELECT
           COUNT(*) as totalBets,
           SUM(CASE WHEN status = 'CASHED_OUT' THEN 1 ELSE 0 END) as wins,
           COALESCE(MAX(cashout_multiplier), 0) as biggestMultiplier,
           COALESCE(MAX(payout), 0) as biggestPayout,
           COALESCE(SUM(stake), 0) as totalWagered,
           COALESCE(SUM(payout), 0) as totalWon
         FROM bets
         WHERE user_id = ?`,
      )
      .get(req.userId) as {
      totalBets: number;
      wins: number;
      biggestMultiplier: number;
      biggestPayout: number;
      totalWagered: number;
      totalWon: number;
    };

    res.json({
      totalBets: agg?.totalBets || 0,
      wins: agg?.wins || 0,
      biggestMultiplier: agg?.biggestMultiplier || 0,
      biggestPayout: agg?.biggestPayout || 0,
      totalWagered: agg?.totalWagered || 0,
      totalWon: agg?.totalWon || 0,
    });
  });

  // --- Live Arena Chat Routes ---
  app.get('/api/chat', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 35')
      .all() as ChatMessageRow[];
    const dbMsgs = rows.map((m) => ({
      id: m.id,
      userName: m.user_name,
      message: m.message,
      isSystem: m.is_system === 1,
      createdAt: m.created_at,
    }));
    const arenaMsgs = engine.getArenaChat();
    const mergedMap = new Map<string, (typeof dbMsgs)[number]>();
    for (const msg of [...dbMsgs, ...arenaMsgs]) {
      mergedMap.set(msg.id, msg);
    }
    const messages = Array.from(mergedMap.values())
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-50);
    res.json({ messages });
  });

  app.post('/api/chat', requireAuth, (req: AuthenticatedRequest, res) => {
    const { message } = req.body as { message?: string };
    const clean = (message || '').trim().replace(/\s+/g, ' ');
    if (clean.length < 1 || clean.length > 180) {
      res.status(400).json({ error: 'Message must be between 1 and 180 characters.' });
      return;
    }

    const lastAt = chatRateLimits.get(req.userId!) || 0;
    if (Date.now() - lastAt < 1500) {
      res.status(429).json({ error: 'Slow down slightly before sending another message.' });
      return;
    }
    chatRateLimits.set(req.userId!, Date.now());

    const user = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.userId) as
      | { full_name: string }
      | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const parts = user.full_name.trim().split(/\s+/);
    const display =
      parts.length > 1 ? `${parts[0]} ${parts[1][0]?.toUpperCase() || ''}.` : parts[0];

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    db.prepare(
      `INSERT INTO chat_messages (id, user_id, user_name, message, is_system, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
    ).run(id, req.userId, display, clean, createdAt);

    const payload = {
      id,
      userName: display,
      message: clean,
      isSystem: false,
      createdAt,
    };

    engine.broadcastEvent('chat:message', payload);
    res.status(201).json({ message: payload });
  });

  app.post('/api/game/bet', requireAuth, (req: AuthenticatedRequest, res) => {
    const { panel, stake, autoCashout } = req.body as {
      panel?: number;
      stake?: number;
      autoCashout?: number | null;
    };
    const validPanel = panel === 2 ? 2 : 1;
    const outcome = engine.placeBet(
      req.userId!,
      validPanel,
      Number(stake),
      autoCashout !== null && autoCashout !== undefined ? Number(autoCashout) : null,
    );
    if (!outcome.ok) {
      res.status(400).json({ error: outcome.error, code: outcome.code });
      return;
    }
    res.json(outcome);
  });

  app.post('/api/game/cancel', requireAuth, (req: AuthenticatedRequest, res) => {
    const { panel } = req.body as { panel?: number };
    const validPanel = panel === 2 ? 2 : 1;
    const outcome = engine.cancelBet(req.userId!, validPanel);
    if (!outcome.ok) {
      res.status(400).json({ error: outcome.error });
      return;
    }
    res.json(outcome);
  });

  app.post('/api/game/cashout', requireAuth, (req: AuthenticatedRequest, res) => {
    const { panel } = req.body as { panel?: number };
    const validPanel = panel === 2 ? 2 : 1;
    const outcome = engine.cashOut(req.userId!, validPanel);
    if (!outcome.ok) {
      res.status(400).json({ error: outcome.error });
      return;
    }
    res.json(outcome);
  });

  // --- Vite / Static Frontend Serving ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`BETKENYA 254 server listening on http://0.0.0.0:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start BETKENYA 254 server:', err);
  process.exit(1);
});
