type RecentLog = {
  ts: string;
  level: "INFO" | "WARN" | "ERROR" | "EXEC";
  tag: string;
  msg: string;
  meta?: Record<string, unknown>;
};

const MAX = 400;
const logs: RecentLog[] = [];

export function pushRecentLog(entry: RecentLog) {
  logs.push(entry);
  if (logs.length > MAX) logs.splice(0, logs.length - MAX);
}

export function getRecentLogs(limit = 120): RecentLog[] {
  const safe = Math.max(1, Math.min(limit, 400));
  return logs.slice(-safe);
}

