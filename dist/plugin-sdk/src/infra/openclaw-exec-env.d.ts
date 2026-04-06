export declare const OPENCLAW_CLI_ENV_VAR = "OPENCLAW_CLI";
export declare const STABLECLAW_CLI_ENV_VAR = "STABLECLAW_CLI";
export declare const OPENCLAW_CLI_ENV_VALUE = "1";
/**
 * Returns the value of the CLI marker env var, checking STABLECLAW_CLI first
 * then falling back to OPENCLAW_CLI for backwards compatibility.
 */
export declare function readCliMarkerValue(env?: NodeJS.ProcessEnv): string | undefined;
export declare function markOpenClawExecEnv<T extends Record<string, string | undefined>>(env: T): T;
export declare function ensureOpenClawExecMarkerOnProcess(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
