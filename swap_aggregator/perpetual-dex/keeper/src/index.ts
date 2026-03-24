import { config } from "./config.js";
import { prisma } from "./db.js";
import { reconcileOpenOrders } from "./db.js";
import { processOpenPositions } from "./watcher.js";
import { startEventListener, stopEventListener } from "./eventListener.js";
import { getKeeperStatus } from "./executor.js";
import { startApi } from "./api.js";
import { startDbBackups } from "./backup.js";
import { log } from "./logger.js";

async function main() {
  log.info("keeper", "═══════════════════════════════════════════════");
  log.info("keeper", "  Zenit Keeper Service – TP/SL/Liquidation");
  log.info("keeper", "  + Blockchain Event Listener (ethers.js v6)");
  log.info("keeper", `  Chain:    ${config.chainId}`);
  log.info("keeper", `  DEX:      ${config.perpDexAddress}`);
  log.info("keeper", `  Poll:     ${config.pollIntervalMs}ms`);
  log.info("keeper", "═══════════════════════════════════════════════");

  try {
    await prisma.$connect();
    log.info("db", "Connected to database");
  } catch (err) {
    log.error("db", "Failed to connect to database", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }

  // Ensure Open rows are unique + openKey is populated
  try {
    const { cancelled, backfilled } = await reconcileOpenOrders();
    if (cancelled > 0 || backfilled > 0) {
      log.info("db", "Reconciled Open orders", { cancelled, backfilled });
    }
  } catch (err) {
    log.warn("db", "Failed to reconcile Open orders (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Start rolling SQLite backups (best-effort)
  if (config.sqliteDbPath) {
    log.info("backup", "Starting DB backups", {
      dbPath: config.sqliteDbPath,
      backupDir: config.backupDir,
      intervalMs: config.backupIntervalMs,
      maxFiles: config.backupMaxFiles,
    });
    startDbBackups({
      dbPath: config.sqliteDbPath,
      backupDir: config.backupDir,
      intervalMs: config.backupIntervalMs,
      maxFiles: config.backupMaxFiles,
    });
  } else {
    log.warn("backup", "SQLite path not resolved; backups disabled", {
      databaseUrl: process.env.DATABASE_URL,
    });
  }

  try {
    const status = await getKeeperStatus();
    log.info("keeper", `Wallet status`, {
      address: status.address,
      nativeBalance: `${status.nativeBalance} PAS`,
      pendingReward: `${status.pendingReward} zUSDC`,
    });
  } catch (err) {
    log.warn("keeper", `Could not fetch keeper wallet status`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Start REST API for frontend TP/SL registration
  try {
    await startApi();
  } catch (err) {
    log.error("keeper", "Failed to start REST API (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Start real-time blockchain event listener (PositionOpened, PositionClosed, etc.)
  try {
    await startEventListener();
    log.info("keeper", "Blockchain event listener started");
  } catch (err) {
    log.error("keeper", "Failed to start event listener (non-fatal – polling continues)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Start TP/SL/Liquidation polling loop
  let cycleCount = 0;

  const loop = async () => {
    cycleCount++;
    const cycleStart = Date.now();

    try {
      log.info("keeper", `─── Cycle #${cycleCount} ───`);
      await processOpenPositions();
    } catch (err) {
      log.error("keeper", `Unhandled error in cycle #${cycleCount}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const elapsed = Date.now() - cycleStart;
    log.info("keeper", `Cycle #${cycleCount} finished in ${elapsed}ms, next in ${config.pollIntervalMs}ms`);

    setTimeout(loop, config.pollIntervalMs);
  };

  await loop();
}

async function shutdown(signal: string) {
  log.warn("keeper", `Received ${signal} – shutting down gracefully`);
  stopEventListener();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  log.error("keeper", "Fatal startup error", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
