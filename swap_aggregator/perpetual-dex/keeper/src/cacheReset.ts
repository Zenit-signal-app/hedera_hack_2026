type CacheResetState = {
  /** Epoch ms */
  lastResetAt: number;
  /** Monotonic counter to help debugging */
  seq: number;
};

const byWallet = new Map<string, CacheResetState>();

function norm(wallet: string): string {
  return wallet.trim().toLowerCase();
}

export function notifyCacheReset(walletAddress: string): CacheResetState {
  const key = norm(walletAddress);
  const prev = byWallet.get(key);
  const next: CacheResetState = {
    lastResetAt: Date.now(),
    seq: (prev?.seq ?? 0) + 1,
  };
  byWallet.set(key, next);
  return next;
}

export function getCacheResetState(walletAddress: string): CacheResetState {
  return byWallet.get(norm(walletAddress)) ?? { lastResetAt: 0, seq: 0 };
}

