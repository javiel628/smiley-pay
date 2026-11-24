import crypto from 'crypto';

export interface DarajaConfig {
  env: 'sandbox' | 'production';
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passkey: string;
  transactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  partyB: string;
  callbackUrl: string;
  callbackSecret: string;
}

let cachedToken: { token: string; expiresAt: number; env: string } | null = null;

const cleanSecret = (val?: string) =>
  (val || '').trim().replace(/^["']|["']$/g, '').trim();

export function getDarajaPublicStatus(): {
  configured: boolean;
  env: 'sandbox' | 'production';
  missingSecrets: string[];
} {
  const env: 'sandbox' | 'production' =
    cleanSecret(process.env.DARAJA_ENV) === 'production' ? 'production' : 'sandbox';
  const missing: string[] = [];
  if (!cleanSecret(process.env.DARAJA_CONSUMER_KEY)) missing.push('DARAJA_CONSUMER_KEY');
  if (!cleanSecret(process.env.DARAJA_CONSUMER_SECRET)) missing.push('DARAJA_CONSUMER_SECRET');
  if (!cleanSecret(process.env.DARAJA_PASSKEY)) missing.push('DARAJA_PASSKEY');
  if (env === 'production' && !cleanSecret(process.env.DARAJA_SHORTCODE)) {
    missing.push('DARAJA_SHORTCODE');
  }

  return {
    configured: missing.length === 0,
    env,
    missingSecrets: missing,
  };
}

export function loadDarajaConfig(fallbackOrigin?: string): DarajaConfig {
  const status = getDarajaPublicStatus();
  if (!status.configured) {
    throw new Error(
      `Safaricom Daraja is not configured. Add ${status.missingSecrets.join(', ')} in Settings -> Secrets.`,
    );
  }

  const env = status.env;
  const baseUrl =
    env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';

  const consumerKey = cleanSecret(process.env.DARAJA_CONSUMER_KEY);
  const consumerSecret = cleanSecret(process.env.DARAJA_CONSUMER_SECRET);
  const shortCode = cleanSecret(process.env.DARAJA_SHORTCODE) || '174379';
  const passkey = cleanSecret(process.env.DARAJA_PASSKEY);
  const transactionType =
    process.env.DARAJA_TRANSACTION_TYPE?.trim() === 'CustomerBuyGoodsOnline'
      ? 'CustomerBuyGoodsOnline'
      : 'CustomerPayBillOnline';
  const partyB = process.env.DARAJA_PARTY_B?.trim() || shortCode;
  const callbackSecret = process.env.DARAJA_CALLBACK_SECRET?.trim() || '';

  let callbackUrl = process.env.DARAJA_CALLBACK_URL?.trim() || '';
  if (!callbackUrl) {
    const appUrl = (process.env.APP_URL || fallbackOrigin || '').trim().replace(/\/+$/, '');
    if (!appUrl) {
      throw new Error('APP_URL or DARAJA_CALLBACK_URL must be configured for M-Pesa callbacks.');
    }
    callbackUrl = `${appUrl}/api/mpesa/callback`;
  }

  if (callbackSecret) {
    const sep = callbackUrl.includes('?') ? '&' : '?';
    callbackUrl = `${callbackUrl}${sep}secret=${encodeURIComponent(callbackSecret)}`;
  }

  return {
    env,
    baseUrl,
    consumerKey,
    consumerSecret,
    shortCode,
    passkey,
    transactionType,
    partyB,
    callbackUrl,
    callbackSecret,
  };
}

/**
 * Formats current time in East Africa Time (UTC+3) as YYYYMMDDHHmmss for Daraja STK Push.
 */
export function getNairobiTimestamp(): string {
  const nowUtcMs = Date.now();
  const eatDate = new Date(nowUtcMs + 3 * 60 * 60 * 1000);
  const yyyy = eatDate.getUTCFullYear();
  const mm = String(eatDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(eatDate.getUTCDate()).padStart(2, '0');
  const hh = String(eatDate.getUTCHours()).padStart(2, '0');
  const mi = String(eatDate.getUTCMinutes()).padStart(2, '0');
  const ss = String(eatDate.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

export function buildStkPassword(shortCode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortCode}${passkey}${timestamp}`, 'utf8').toString('base64');
}

export function toDarajaMsisdn(normalizedPlus254: string): string {
  return normalizedPlus254.replace(/^\+/, '');
}

async function parseJsonSafe<T>(res: Response): Promise<{ parsed: T | null; rawText: string }> {
  const rawText = await res.text();
  try {
    return { parsed: JSON.parse(rawText) as T, rawText };
  } catch {
    return { parsed: null, rawText };
  }
}

async function getDarajaAccessToken(config: DarajaConfig, forceRefresh = false): Promise<string> {
  if (
    !forceRefresh &&
    cachedToken &&
    cachedToken.env === config.env &&
    cachedToken.expiresAt > Date.now() + 15000
  ) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(
    `${config.consumerKey}:${config.consumerSecret}`,
    'utf8',
  ).toString('base64');

  const res = await fetch(
    `${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      method: 'GET',
      headers: {
        Authorization: `Basic ${credentials}`,
      },
      signal: AbortSignal.timeout(18000),
    },
  );

  const { parsed, rawText } = await parseJsonSafe<{
    access_token?: string;
    expires_in?: string;
    errorMessage?: string;
    error?: string;
  }>(res);

  if (!res.ok || !parsed?.access_token) {
    const detail = parsed?.errorMessage || parsed?.error || rawText.slice(0, 180) || 'Empty response';
    throw new Error(
      `Daraja ${config.env} authentication failed (HTTP ${res.status}): ${detail}. Check your Consumer Key & Secret.`,
    );
  }

  const cleanToken = parsed.access_token.trim();
  const expiresInSec = Number(parsed.expires_in) || 3599;
  cachedToken = {
    token: cleanToken,
    expiresAt: Date.now() + expiresInSec * 1000,
    env: config.env,
  };
  return cleanToken;
}

export interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export async function initiateStkPush(
  config: DarajaConfig,
  params: {
    phonePlus254: string;
    amountKes: number;
    accountReference: string;
    description: string;
  },
): Promise<StkPushResponse> {
  const sendRequest = async (forceRefreshToken: boolean) => {
    const token = await getDarajaAccessToken(config, forceRefreshToken);
    const timestamp = getNairobiTimestamp();
    const password = buildStkPassword(config.shortCode, config.passkey, timestamp);
    const msisdn = toDarajaMsisdn(params.phonePlus254);

    const payload = {
      BusinessShortCode: config.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: config.transactionType,
      Amount: Math.round(params.amountKes),
      PartyA: msisdn,
      PartyB: config.partyB,
      PhoneNumber: msisdn,
      CallBackURL: config.callbackUrl,
      AccountReference: params.accountReference.slice(0, 12),
      TransactionDesc: params.description.slice(0, 13),
    };

    const res = await fetch(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });

    const { parsed, rawText } = await parseJsonSafe<
      Partial<StkPushResponse> & {
        errorMessage?: string;
        errorCode?: string;
      }
    >(res);

    return { res, parsed, rawText };
  };

  let attempt = await sendRequest(false);

  // Retry once with a fresh OAuth token if Daraja rejects the cached/initial token
  if (
    !attempt.res.ok &&
    (attempt.parsed?.errorCode === '404.001.03' ||
      attempt.parsed?.errorMessage?.toLowerCase().includes('invalid access token'))
  ) {
    cachedToken = null;
    attempt = await sendRequest(true);
  }

  const { res, parsed, rawText } = attempt;

  if (!res.ok || parsed?.ResponseCode !== '0' || !parsed?.CheckoutRequestID) {
    const codeTag = parsed?.errorCode ? `[${parsed.errorCode}] ` : '';
    const msg =
      parsed?.errorMessage ||
      parsed?.ResponseDescription ||
      rawText.slice(0, 180) ||
      `HTTP ${res.status}`;

    if (
      parsed?.errorCode === '404.001.03' ||
      msg.toLowerCase().includes('invalid access token')
    ) {
      throw new Error(
        `Safaricom Daraja (${config.env}) returned ${codeTag}${msg}. Ensure "Lipa Na M-Pesa Sandbox" / M-Pesa Express is enabled on your Daraja app and your Consumer Key/Secret match ${config.env}.`,
      );
    }

    throw new Error(`Safaricom Daraja (${config.env}): ${codeTag}${msg}`);
  }

  return parsed as StkPushResponse;
}

export interface StkQueryResponse {
  ResponseCode: string;
  ResponseDescription: string;
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: string;
  ResultDesc: string;
}

export async function queryStkPushStatus(
  config: DarajaConfig,
  checkoutRequestId: string,
): Promise<StkQueryResponse> {
  const token = await getDarajaAccessToken(config);
  const timestamp = getNairobiTimestamp();
  const password = buildStkPassword(config.shortCode, config.passkey, timestamp);

  const res = await fetch(`${config.baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: config.shortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const { parsed, rawText } = await parseJsonSafe<
    Partial<StkQueryResponse> & {
      errorMessage?: string;
    }
  >(res);

  if (!res.ok || !parsed) {
    throw new Error(
      parsed?.errorMessage || rawText.slice(0, 160) || `Daraja STK query failed (${res.status}).`,
    );
  }

  return parsed as StkQueryResponse;
}

export function verifyCallbackSecret(providedSecret: string | undefined): boolean {
  const expected = process.env.DARAJA_CALLBACK_SECRET?.trim();
  if (!expected) return true;
  if (!providedSecret) return false;
  const a = Buffer.from(providedSecret, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
