import type { OpenClawConfig } from "../config/config.js";

const DEFAULT_AGENT_TIMEOUT_SECONDS = 3 * 60; // 3 minutes
const MAX_AGENT_TIMEOUT_SECONDS = 10 * 60; // 10 minutes (hard ceiling)
const MAX_SAFE_TIMEOUT_MS = 2_147_000_000;

const normalizeNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : undefined;

export function resolveAgentTimeoutSeconds(cfg?: OpenClawConfig): number {
  const raw = normalizeNumber(cfg?.agents?.defaults?.timeoutSeconds);
  const seconds = raw ?? DEFAULT_AGENT_TIMEOUT_SECONDS;
  // Clamp to [1, MAX_AGENT_TIMEOUT_SECONDS] to prevent runaway agents.
  return Math.min(Math.max(seconds, 1), MAX_AGENT_TIMEOUT_SECONDS);
}

export function resolveAgentTimeoutMs(opts: {
  cfg?: OpenClawConfig;
  overrideMs?: number | null;
  overrideSeconds?: number | null;
  minMs?: number;
}): number {
  const minMs = Math.max(normalizeNumber(opts.minMs) ?? 1, 1);
  const clampTimeoutMs = (valueMs: number) =>
    Math.min(Math.max(valueMs, minMs), MAX_SAFE_TIMEOUT_MS);
  const defaultMs = clampTimeoutMs(resolveAgentTimeoutSeconds(opts.cfg) * 1000);
  // Use the maximum timer-safe timeout to represent "no timeout" when explicitly set to 0.
  const NO_TIMEOUT_MS = MAX_SAFE_TIMEOUT_MS;
  // Max agent timeout ceiling: 10 minutes. Override values exceeding this
  // are clamped. A literal 0 still means "no timeout".
  const maxAgentTimeoutMs = MAX_AGENT_TIMEOUT_SECONDS * 1000;
  const clampToAgentCeiling = (valueMs: number) =>
    Math.min(clampTimeoutMs(valueMs), maxAgentTimeoutMs);
  const overrideMs = normalizeNumber(opts.overrideMs);
  if (overrideMs !== undefined) {
    if (overrideMs === 0) {
      return NO_TIMEOUT_MS;
    }
    if (overrideMs < 0) {
      return defaultMs;
    }
    return clampToAgentCeiling(overrideMs);
  }
  const overrideSeconds = normalizeNumber(opts.overrideSeconds);
  if (overrideSeconds !== undefined) {
    if (overrideSeconds === 0) {
      return NO_TIMEOUT_MS;
    }
    if (overrideSeconds < 0) {
      return defaultMs;
    }
    return clampToAgentCeiling(overrideSeconds * 1000);
  }
  return defaultMs;
}
