const RESET  = "\x1b[0m";
const DIM    = "\x1b[2m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED    = "\x1b[31m";
const CYAN   = "\x1b[36m";
const MAGENTA = "\x1b[35m";

import { pushRecentLog } from "./recentLogs.js";

function ts(): string {
  return new Date().toISOString();
}

function fmt(level: string, color: string, tag: string, msg: string, meta?: Record<string, unknown>): string {
  const metaStr = meta ? ` ${DIM}${JSON.stringify(meta)}${RESET}` : "";
  return `${DIM}${ts()}${RESET} ${color}${level}${RESET} [${CYAN}${tag}${RESET}] ${msg}${metaStr}`;
}

function capture(level: "INFO" | "WARN" | "ERROR" | "EXEC", tag: string, msg: string, meta?: Record<string, unknown>) {
  pushRecentLog({ ts: ts(), level, tag, msg, meta });
}

export const log = {
  info(tag: string, msg: string, meta?: Record<string, unknown>) {
    capture("INFO", tag, msg, meta);
    console.log(fmt("INFO ", GREEN, tag, msg, meta));
  },
  warn(tag: string, msg: string, meta?: Record<string, unknown>) {
    capture("WARN", tag, msg, meta);
    console.warn(fmt("WARN ", YELLOW, tag, msg, meta));
  },
  error(tag: string, msg: string, meta?: Record<string, unknown>) {
    capture("ERROR", tag, msg, meta);
    console.error(fmt("ERROR", RED, tag, msg, meta));
  },
  action(tag: string, msg: string, meta?: Record<string, unknown>) {
    capture("EXEC", tag, msg, meta);
    console.log(fmt("EXEC ", MAGENTA, tag, msg, meta));
  },
};
