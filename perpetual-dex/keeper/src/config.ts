import "dotenv/config";
import type { KeeperConfig } from "./types.js";
import path from "node:path";

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

function resolveSqliteFilePath(databaseUrl: string): string | null {
  if (!databaseUrl.startsWith("file:")) return null;
  const raw = databaseUrl.slice("file:".length);
  // Prisma resolves file: paths relative to the schema file dir (prisma/).
  // Our schema lives in keeper/prisma, so mimic that here.
  const baseDir = path.resolve(process.cwd(), "prisma");
  return path.resolve(baseDir, raw);
}

export const config: KeeperConfig = {
  rpcUrl: env("RPC_URL", "https://eth-rpc-testnet.polkadot.io/"),
  chainId: Number(env("CHAIN_ID", "420420417")),
  perpDexAddress: env("PERP_DEX_ADDRESS", "0xa8de3e548054417e4d918FAC46E990aF623AC7BA") as `0x${string}`,
  tokenAddress: env("TOKEN_ADDRESS", "0x277E42B9454fB36A7Eaa52D4cE332bEF71dd017a") as `0x${string}`,
  keeperPrivateKey: env("KEEPER_PRIVATE_KEY") as `0x${string}`,
  oraclePrivateKey: (process.env.ORACLE_PRIVATE_KEY?.trim() as `0x${string}` | undefined) ?? null,
  pollIntervalMs: Number(env("POLL_INTERVAL_MS", "5000")),
  pythEndpoint: env("PYTH_ENDPOINT", "https://hermes.pyth.network"),
  apiPort: Number(env("API_PORT", "3100")),
  // Liquidation pricing model (must match frontend PnL assumptions)
  liquidationMmr: Number(env("LIQUIDATION_MMR", "0.01")),
  // Backup config
  sqliteDbPath: resolveSqliteFilePath(env("DATABASE_URL", "file:./dev.db")),
  backupDir: path.resolve(process.cwd(), env("KEEPER_BACKUP_DIR", "data/backups")),
  backupIntervalMs: Number(env("KEEPER_BACKUP_INTERVAL_MS", "60000")),
  backupMaxFiles: Number(env("KEEPER_BACKUP_MAX_FILES", "120")),
  oracleAddress: (process.env.ORACLE_ADDRESS?.trim() as `0x${string}` | undefined) ?? null,
};
