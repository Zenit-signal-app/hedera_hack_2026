import { ethers } from "ethers";
import { config } from "./config.js";
import { NonceManager } from "./nonceManager.js";

type Manager = {
  provider: ethers.JsonRpcProvider;
  wallet: ethers.Wallet;
  nonceManager: NonceManager;
  runExclusive: <T>(fn: () => Promise<T>) => Promise<T>;
};

const provider = new ethers.JsonRpcProvider(config.rpcUrl, {
  chainId: config.chainId,
  name: "polkadot-hub-testnet",
});

const managers = new Map<string, Manager>();
const queues = new Map<string, Promise<void>>();

function normKey(pk: string): string {
  return pk.trim().toLowerCase();
}

function getQueue(key: string): Promise<void> {
  return queues.get(key) ?? Promise.resolve();
}

function setQueue(key: string, p: Promise<void>) {
  queues.set(key, p);
}

export function getTxManager(privateKey: `0x${string}`): Manager {
  const key = normKey(privateKey);
  const existing = managers.get(key);
  if (existing) return existing;

  const wallet = new ethers.Wallet(privateKey, provider);
  const nonceManager = new NonceManager(provider, wallet.address);

  const runExclusive = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const prev = getQueue(key);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    setQueue(key, prev.then(() => gate).catch(() => gate));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  };

  const mgr: Manager = { provider, wallet, nonceManager, runExclusive };
  managers.set(key, mgr);
  return mgr;
}

