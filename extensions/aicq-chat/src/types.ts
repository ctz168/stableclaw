/**
 * Core TypeScript interfaces for the AICQ plugin (standalone version).
 */

/** Plugin configuration loaded from openclaw.plugin.json configSchema + env vars. */
export interface PluginConfig {
  serverUrl: string;
  agentId: string;
  maxFriends: number;
  autoAcceptFriends: boolean;
}

/** Simple logger interface. */
export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}
