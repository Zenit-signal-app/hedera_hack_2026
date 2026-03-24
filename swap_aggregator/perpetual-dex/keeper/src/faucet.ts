import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey,
  Status,
  TokenId,
  TransferTransaction,
} from "@hashgraph/sdk";
import { config } from "./config.js";
import { log } from "./logger.js";

const TAG = "faucet";

const HTS_TOKEN_ID = (process.env.FAUCET_HTS_TOKEN_ID ?? "0.0.8271323").trim();
const AMOUNT_ZUSDC = 1000n * 10n ** 8n; // HTS token decimals = 8
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CLAIMS_PER_WINDOW = 5;
const RECEIPT_TIMEOUT_MS = 45_000;

// In-memory claim history map: normalised wallet → claim timestamps
const claimHistory = new Map<string, number[]>();

let _client: Client | null = null;
let _tokenId: TokenId | null = null;
let _faucetAccountId: AccountId | null = null;
let _faucetPrivateKey: PrivateKey | null = null;

function parseHederaPrivateKey(raw: string): PrivateKey {
  const v = raw.trim();
  try {
    return PrivateKey.fromStringECDSA(v);
  } catch {
    return PrivateKey.fromStringED25519(v);
  }
}

async function resolveAccountIdFromMirror(input: string): Promise<AccountId | null> {
  try {
    const url = `https://testnet.mirrornode.hedera.com/api/v1/accounts/${input}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { account?: string };
    if (!data?.account) return null;
    return AccountId.fromString(data.account);
  } catch {
    return null;
  }
}

async function getInstances() {
  if (!_tokenId) _tokenId = TokenId.fromString(HTS_TOKEN_ID);

  if (!_faucetPrivateKey) {
    const faucetKeyRaw = (process.env.FAUCET_PRIVATE_KEY ?? config.keeperPrivateKey) as string;
    _faucetPrivateKey = parseHederaPrivateKey(faucetKeyRaw);
  }

  if (!_faucetAccountId) {
    const envAccountId = (process.env.FAUCET_ACCOUNT_ID ?? "").trim();
    if (envAccountId) {
      _faucetAccountId = AccountId.fromString(envAccountId);
    } else {
      const evmAddress = `0x${_faucetPrivateKey.publicKey.toEvmAddress()}`;
      const resolved = await resolveAccountIdFromMirror(evmAddress);
      if (!resolved) {
        throw new Error("Cannot resolve faucet account ID. Set FAUCET_ACCOUNT_ID in keeper/.env");
      }
      _faucetAccountId = resolved;
    }
  }

  if (!_client) {
    _client = Client.forTestnet();
    _client.setOperator(_faucetAccountId, _faucetPrivateKey);
  }

  return {
    client: _client,
    tokenId: _tokenId,
    faucetAccountId: _faucetAccountId,
  };
}

/** Check 24h claim window. Returns { ok, remainingMs, remainingClaims }. */
export function checkCooldown(walletAddress: string): { ok: boolean; remainingMs: number; remainingClaims: number } {
  const key = walletAddress.toLowerCase();
  const now = Date.now();
  const recent = (claimHistory.get(key) ?? []).filter((ts) => now - ts < COOLDOWN_MS);
  claimHistory.set(key, recent);

  if (recent.length < MAX_CLAIMS_PER_WINDOW) {
    return {
      ok: true,
      remainingMs: 0,
      remainingClaims: MAX_CLAIMS_PER_WINDOW - recent.length,
    };
  }

  const oldestInWindow = recent[0];
  const remainingMs = Math.max(0, COOLDOWN_MS - (now - oldestInWindow));
  return {
    ok: false,
    remainingMs,
    remainingClaims: 0,
  };
}

/** Transfer 1000 zUSDC (HTS) to target account ID. Enforces max 5 claims / 24h. */
export async function sendZUSDC(toAccountId: string): Promise<{
  txHash: string;
  amount: string;
  faucetWallet: string;
}> {
  const key = toAccountId.toLowerCase();

  const cooldown = checkCooldown(key);
  if (!cooldown.ok) {
    const h = Math.ceil(cooldown.remainingMs / 3_600_000);
    throw new Error(`Rate limit: this wallet reached 5 faucet claims in 24h. Try again in ~${h}h.`);
  }

  const { client, tokenId, faucetAccountId } = await getInstances();

  log.info(TAG, `Sending 1000 zUSDC (HTS)`, { toAccountId, from: faucetAccountId.toString(), tokenId: tokenId.toString() });

  const faucetBalance = await new AccountBalanceQuery().setAccountId(faucetAccountId).execute(client);
  const tokenBalEntry = faucetBalance.tokens?.get(tokenId);
  const tokenBalance = tokenBalEntry ? BigInt(tokenBalEntry.toString()) : 0n;
  if (tokenBalance < AMOUNT_ZUSDC) {
    throw new Error("Faucet wallet has insufficient HTS zUSDC balance. Please contact the admin.");
  }

  const recipient = AccountId.fromString(toAccountId);
  const tx = await new TransferTransaction()
    .addTokenTransfer(tokenId, faucetAccountId, -AMOUNT_ZUSDC)
    .addTokenTransfer(tokenId, recipient, AMOUNT_ZUSDC)
    .execute(client);

  const startedAt = Date.now();
  let status: Status | null = null;
  while (Date.now() - startedAt < RECEIPT_TIMEOUT_MS) {
    try {
      const receipt = await tx.getReceipt(client);
      status = receipt.status;
      if (status) break;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!status || status.toString() !== "SUCCESS") {
    throw new Error("HTS transfer failed or timed out.");
  }

  // Record claim only after success (or broadcast timeout fallback).
  const now = Date.now();
  const recent = (claimHistory.get(key) ?? []).filter((ts) => now - ts < COOLDOWN_MS);
  recent.push(now);
  claimHistory.set(key, recent);

  const txHash = tx.transactionId.toString();
  log.action(TAG, `1000 zUSDC HTS transfer confirmed`, {
    toAccountId,
    txHash,
  });

  return {
    txHash,
    amount: "1000",
    faucetWallet: faucetAccountId.toString(),
  };
}
