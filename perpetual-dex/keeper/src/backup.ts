import { promises as fs } from "node:fs";
import path from "node:path";
import { log } from "./logger.js";

type BackupOptions = {
  dbPath: string;
  backupDir: string;
  intervalMs: number;
  maxFiles: number;
};

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

function timestampForFilename(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function listBackups(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".db"))
    .map((e) => path.join(dir, e.name))
    .sort();
}

async function pruneOldBackups(dir: string, maxFiles: number) {
  if (maxFiles <= 0) return;
  const files = await listBackups(dir);
  const extra = files.length - maxFiles;
  if (extra <= 0) return;
  const toDelete = files.slice(0, extra);
  await Promise.allSettled(toDelete.map((f) => fs.unlink(f)));
}

export function startDbBackups(opts: BackupOptions): NodeJS.Timeout {
  const tag = "backup";

  const tick = async () => {
    try {
      await ensureDir(opts.backupDir);
      const base = path.basename(opts.dbPath).replace(/\.db$/i, "");
      const out = path.join(opts.backupDir, `${base}-${timestampForFilename()}.db`);
      await fs.copyFile(opts.dbPath, out);
      await pruneOldBackups(opts.backupDir, opts.maxFiles);
      log.info(tag, "DB backup created", { out });
    } catch (err) {
      log.warn(tag, "DB backup failed", { error: err instanceof Error ? err.message : String(err) });
    }
  };

  // Run first backup quickly, then interval.
  setTimeout(tick, 3_000);
  return setInterval(tick, opts.intervalMs);
}

