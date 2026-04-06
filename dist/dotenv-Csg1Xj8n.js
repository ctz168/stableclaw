import { h as resolveConfigDir } from "./utils-CN_F_3Qg.js";
import { i as normalizeEnvVarKey, n as isDangerousHostEnvOverrideVarName, r as isDangerousHostEnvVarName } from "./host-env-security-SlXI58bc.js";
import fsSync from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
//#region src/infra/dotenv.ts
const BLOCKED_WORKSPACE_DOTENV_KEYS = new Set([
	"ALL_PROXY",
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_OAUTH_TOKEN",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"NODE_TLS_REJECT_UNAUTHORIZED",
	"NO_PROXY",
	"OPENCLAW_AGENT_DIR",
	"OPENCLAW_BUNDLED_HOOKS_DIR",
	"OPENCLAW_BUNDLED_PLUGINS_DIR",
	"OPENCLAW_BUNDLED_SKILLS_DIR",
	"OPENCLAW_CONFIG_PATH",
	"OPENCLAW_GATEWAY_PASSWORD",
	"OPENCLAW_GATEWAY_SECRET",
	"OPENCLAW_GATEWAY_TOKEN",
	"OPENCLAW_HOME",
	"OPENCLAW_LIVE_ANTHROPIC_KEY",
	"OPENCLAW_LIVE_ANTHROPIC_KEYS",
	"OPENCLAW_LIVE_GEMINI_KEY",
	"OPENCLAW_LIVE_OPENAI_KEY",
	"OPENCLAW_OAUTH_DIR",
	"OPENCLAW_PINNED_PYTHON",
	"OPENCLAW_PINNED_WRITE_PYTHON",
	"OPENCLAW_PROFILE",
	"OPENCLAW_STATE_DIR",
	"OPENCLAW_TEST_TAILSCALE_BINARY",
	"OPENAI_API_KEY",
	"OPENAI_API_KEYS",
	"PI_CODING_AGENT_DIR",
	"STABLECLAW_AGENT_DIR",
	"STABLECLAW_BUNDLED_HOOKS_DIR",
	"STABLECLAW_BUNDLED_PLUGINS_DIR",
	"STABLECLAW_BUNDLED_SKILLS_DIR",
	"STABLECLAW_CONFIG_PATH",
	"STABLECLAW_GATEWAY_PASSWORD",
	"STABLECLAW_GATEWAY_SECRET",
	"STABLECLAW_GATEWAY_TOKEN",
	"STABLECLAW_HOME",
	"STABLECLAW_LIVE_ANTHROPIC_KEY",
	"STABLECLAW_LIVE_ANTHROPIC_KEYS",
	"STABLECLAW_LIVE_GEMINI_KEY",
	"STABLECLAW_LIVE_OPENAI_KEY",
	"STABLECLAW_OAUTH_DIR",
	"STABLECLAW_PINNED_PYTHON",
	"STABLECLAW_PINNED_WRITE_PYTHON",
	"STABLECLAW_PROFILE",
	"STABLECLAW_STATE_DIR",
	"STABLECLAW_TEST_TAILSCALE_BINARY"
]);
const BLOCKED_WORKSPACE_DOTENV_SUFFIXES = ["_BASE_URL"];
const BLOCKED_WORKSPACE_DOTENV_PREFIXES = ["ANTHROPIC_API_KEY_", "OPENAI_API_KEY_"];
function shouldBlockWorkspaceRuntimeDotEnvKey(key) {
	return isDangerousHostEnvVarName(key) || isDangerousHostEnvOverrideVarName(key);
}
function shouldBlockRuntimeDotEnvKey(key) {
	return false;
}
function shouldBlockWorkspaceDotEnvKey(key) {
	const upper = key.toUpperCase();
	return shouldBlockWorkspaceRuntimeDotEnvKey(upper) || BLOCKED_WORKSPACE_DOTENV_KEYS.has(upper) || BLOCKED_WORKSPACE_DOTENV_PREFIXES.some((prefix) => upper.startsWith(prefix)) || BLOCKED_WORKSPACE_DOTENV_SUFFIXES.some((suffix) => upper.endsWith(suffix));
}
function loadDotEnvFile(params) {
	let content;
	try {
		content = fsSync.readFileSync(params.filePath, "utf8");
	} catch (error) {
		if (!params.quiet) {
			if ((error && typeof error === "object" && "code" in error ? String(error.code) : void 0) !== "ENOENT") console.warn(`[dotenv] Failed to read ${params.filePath}: ${String(error)}`);
		}
		return;
	}
	let parsed;
	try {
		parsed = dotenv.parse(content);
	} catch (error) {
		if (!params.quiet) console.warn(`[dotenv] Failed to parse ${params.filePath}: ${String(error)}`);
		return;
	}
	for (const [rawKey, value] of Object.entries(parsed)) {
		const key = normalizeEnvVarKey(rawKey, { portable: true });
		if (!key || params.shouldBlockKey(key)) continue;
		if (process.env[key] !== void 0) continue;
		process.env[key] = value;
	}
}
function loadRuntimeDotEnvFile(filePath, opts) {
	loadDotEnvFile({
		filePath,
		shouldBlockKey: shouldBlockRuntimeDotEnvKey,
		quiet: opts?.quiet ?? true
	});
}
function loadWorkspaceDotEnvFile(filePath, opts) {
	loadDotEnvFile({
		filePath,
		shouldBlockKey: shouldBlockWorkspaceDotEnvKey,
		quiet: opts?.quiet ?? true
	});
}
function loadDotEnv(opts) {
	const quiet = opts?.quiet ?? true;
	loadWorkspaceDotEnvFile(path.join(process.cwd(), ".env"), { quiet });
	loadRuntimeDotEnvFile(path.join(resolveConfigDir(process.env), ".env"), { quiet });
}
//#endregion
export { loadRuntimeDotEnvFile as n, loadWorkspaceDotEnvFile as r, loadDotEnv as t };
