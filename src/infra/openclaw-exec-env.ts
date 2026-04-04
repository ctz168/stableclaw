export const OPENCLAW_CLI_ENV_VAR = "OPENCLAW_CLI";
export const STABLECLAW_CLI_ENV_VAR = "STABLECLAW_CLI";
export const OPENCLAW_CLI_ENV_VALUE = "1";

/**
 * Returns the value of the CLI marker env var, checking STABLECLAW_CLI first
 * then falling back to OPENCLAW_CLI for backwards compatibility.
 */
export function readCliMarkerValue(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env[STABLECLAW_CLI_ENV_VAR] ?? env[OPENCLAW_CLI_ENV_VAR];
}

export function markOpenClawExecEnv<T extends Record<string, string | undefined>>(env: T): T {
  return {
    ...env,
    [STABLECLAW_CLI_ENV_VAR]: OPENCLAW_CLI_ENV_VALUE,
    [OPENCLAW_CLI_ENV_VAR]: OPENCLAW_CLI_ENV_VALUE,
  };
}

export function ensureOpenClawExecMarkerOnProcess(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[STABLECLAW_CLI_ENV_VAR] = OPENCLAW_CLI_ENV_VALUE;
  env[OPENCLAW_CLI_ENV_VAR] = OPENCLAW_CLI_ENV_VALUE;
  return env;
}
