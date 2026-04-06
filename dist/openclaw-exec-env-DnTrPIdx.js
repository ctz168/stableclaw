//#region src/infra/openclaw-exec-env.ts
const OPENCLAW_CLI_ENV_VAR = "OPENCLAW_CLI";
const STABLECLAW_CLI_ENV_VAR = "STABLECLAW_CLI";
function markOpenClawExecEnv(env) {
	return {
		...env,
		[STABLECLAW_CLI_ENV_VAR]: "1",
		[OPENCLAW_CLI_ENV_VAR]: "1"
	};
}
function ensureOpenClawExecMarkerOnProcess(env = process.env) {
	env[STABLECLAW_CLI_ENV_VAR] = "1";
	env[OPENCLAW_CLI_ENV_VAR] = "1";
	return env;
}
//#endregion
export { markOpenClawExecEnv as n, ensureOpenClawExecMarkerOnProcess as t };
