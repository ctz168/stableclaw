import { o as resolveRequiredHomeDir } from "./home-dir-n9onX5PG.js";
import { E as isPlainObject$1 } from "./utils-CN_F_3Qg.js";
import { n as VERSION } from "./version-BNzJ37Re.js";
import { _ as resolveStateDir, c as resolveDefaultConfigCandidates, o as resolveConfigPath } from "./paths-GWMNxnBn.js";
import { t as isBlockedObjectKey } from "./prototype-keys-DrjhYNcz.js";
import { i as normalizeEnvVarKey, n as isDangerousHostEnvOverrideVarName, r as isDangerousHostEnvVarName } from "./host-env-security-SlXI58bc.js";
import { t as loadDotEnv } from "./dotenv-Csg1Xj8n.js";
import { a as shouldDeferShellEnvFallback, i as resolveShellEnvFallbackTimeoutMs, o as shouldEnableShellEnvFallback, r as loadShellEnvFallback } from "./shell-env-BTztt4a1.js";
import { t as sanitizeTerminalText } from "./safe-text-DhIQbZid.js";
import { St as findDuplicateAgentDirs, _t as applyLegacyMigrations, a as validateConfigObjectWithPlugins, d as materializeRuntimeConfig, i as validateConfigObjectRawWithPlugins, l as asResolvedSourceConfig, u as asRuntimeConfig, vt as findLegacyConfigIssues, xt as DuplicateAgentDirError } from "./validation-IqV6B-0y.js";
import { n as containsEnvVarReference, r as resolveConfigEnvVars } from "./env-substitution-UhJwb0ys.js";
import { a as resolveConfigIncludes, i as readConfigIncludeFileWithGuards, n as ConfigIncludeError } from "./includes-Ccr-Q5DB.js";
import { t as applyMergePatch } from "./merge-patch-CtvE2OP0.js";
import { n as comparePrereleaseIdentifiers, r as normalizeLegacyDotBetaVersion } from "./semver-compare-DkYCMcwG.js";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { isDeepStrictEqual } from "node:util";
import crypto from "node:crypto";
import JSON5 from "json5";
import dotenv from "dotenv";
//#region src/agents/owner-display.ts
function trimToUndefined(value) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : void 0;
}
/**
* Resolve owner display settings for prompt rendering.
* Keep auth secrets decoupled from owner hash secrets.
*/
function resolveOwnerDisplaySetting(config) {
	const ownerDisplay = config?.commands?.ownerDisplay;
	if (ownerDisplay !== "hash") return {
		ownerDisplay,
		ownerDisplaySecret: void 0
	};
	return {
		ownerDisplay: "hash",
		ownerDisplaySecret: trimToUndefined(config?.commands?.ownerDisplaySecret)
	};
}
/**
* Ensure hash mode has a dedicated secret.
* Returns updated config and generated secret when autofill was needed.
*/
function ensureOwnerDisplaySecret(config, generateSecret = () => crypto.randomBytes(32).toString("hex")) {
	const settings = resolveOwnerDisplaySetting(config);
	if (settings.ownerDisplay !== "hash" || settings.ownerDisplaySecret) return { config };
	const generatedSecret = generateSecret();
	return {
		config: {
			...config,
			commands: {
				...config.commands,
				ownerDisplay: "hash",
				ownerDisplaySecret: generatedSecret
			}
		},
		generatedSecret
	};
}
async function rotateConfigBackups(configPath, ioFs) {
	const backupBase = `${configPath}.bak`;
	const maxIndex = 4;
	await ioFs.unlink(`${backupBase}.${maxIndex}`).catch(() => {});
	for (let index = maxIndex - 1; index >= 1; index -= 1) await ioFs.rename(`${backupBase}.${index}`, `${backupBase}.${index + 1}`).catch(() => {});
	await ioFs.rename(backupBase, `${backupBase}.1`).catch(() => {});
}
/**
* Harden file permissions on all .bak files in the rotation ring.
* copyFile does not guarantee permission preservation on all platforms
* (e.g. Windows, some NFS mounts), so we explicitly chmod each backup
* to owner-only (0o600) to match the main config file.
*/
async function hardenBackupPermissions(configPath, ioFs) {
	if (!ioFs.chmod) return;
	const backupBase = `${configPath}.bak`;
	await ioFs.chmod(backupBase, 384).catch(() => {});
	for (let i = 1; i < 5; i++) await ioFs.chmod(`${backupBase}.${i}`, 384).catch(() => {});
}
/**
* Remove orphan .bak files that fall outside the managed rotation ring.
* These can accumulate from interrupted writes, manual copies, or PID-stamped
* backups (e.g. openclaw.json.bak.1772352289, openclaw.json.bak.before-marketing).
*
* Only files matching `<configBasename>.bak.*` are considered; the primary
* `.bak` and numbered `.bak.1` through `.bak.{N-1}` are preserved.
*/
async function cleanOrphanBackups(configPath, ioFs) {
	if (!ioFs.readdir) return;
	const dir = path.dirname(configPath);
	const bakPrefix = `${path.basename(configPath)}.bak.`;
	const validSuffixes = /* @__PURE__ */ new Set();
	for (let i = 1; i < 5; i++) validSuffixes.add(String(i));
	let entries;
	try {
		entries = await ioFs.readdir(dir);
	} catch {
		return;
	}
	for (const entry of entries) {
		if (!entry.startsWith(bakPrefix)) continue;
		const suffix = entry.slice(bakPrefix.length);
		if (validSuffixes.has(suffix)) continue;
		await ioFs.unlink(path.join(dir, entry)).catch(() => {});
	}
}
/**
* Run the full backup maintenance cycle around config writes.
* Order matters: validate -> rotate ring -> create new .bak -> harden modes -> prune orphan .bak.* files.
*
* **ROOT-CAUSE FIX**: If a content validator is supplied and the current on-disk
* config file FAILS validation, the backup is **rejected** — the invalid config
* must never enter the backup ring. This prevents a scenario where an externally
* corrupted config gets backed up and then later restored via rollback, silently
* replacing a good configuration.
*/
async function maintainConfigBackups(configPath, ioFs, options) {
	if (options?.validateBeforeBackup) try {
		const rawContent = await fsSync.promises.readFile(configPath, "utf-8");
		if (!options.validateBeforeBackup(rawContent)) {
			options.log?.warn?.(`config backup REJECTED: on-disk config at ${configPath} failed validation — invalid content must not enter the backup ring`);
			return;
		}
	} catch (err) {
		options.log?.warn?.(`config backup REJECTED: could not read ${configPath} for validation — ${String(err)}`);
		return;
	}
	await rotateConfigBackups(configPath, ioFs);
	await ioFs.copyFile(configPath, `${configPath}.bak`).catch(() => {});
	await hardenBackupPermissions(configPath, ioFs);
	await cleanOrphanBackups(configPath, ioFs);
}
//#endregion
//#region src/config/env-preserve.ts
/**
* Preserves `${VAR}` environment variable references during config write-back.
*
* When config is read, `${VAR}` references are resolved to their values.
* When writing back, callers pass the resolved config. This module detects
* values that match what a `${VAR}` reference would resolve to and restores
* the original reference, so env var references survive config round-trips.
*
* A value is restored only if:
* 1. The pre-substitution value contained a `${VAR}` pattern
* 2. Resolving that pattern with current env vars produces the incoming value
*
* If a caller intentionally set a new value (different from what the env var
* resolves to), the new value is kept as-is.
*/
const ENV_VAR_PATTERN = /\$\{[A-Z_][A-Z0-9_]*\}/;
/**
* Check if a string contains any `${VAR}` env var references.
*/
function hasEnvVarRef(value) {
	return ENV_VAR_PATTERN.test(value);
}
/**
* Resolve `${VAR}` references in a single string using the given env.
* Returns null if any referenced var is missing (instead of throwing).
*
* Mirrors the substitution semantics of `substituteString` in env-substitution.ts:
* - `${VAR}` → env value (returns null if missing)
* - `$${VAR}` → literal `${VAR}` (escape sequence)
*/
function tryResolveString(template, env) {
	const ENV_VAR_NAME = /^[A-Z_][A-Z0-9_]*$/;
	const chunks = [];
	for (let i = 0; i < template.length; i++) {
		if (template[i] === "$") {
			if (template[i + 1] === "$" && template[i + 2] === "{") {
				const start = i + 3;
				const end = template.indexOf("}", start);
				if (end !== -1) {
					const name = template.slice(start, end);
					if (ENV_VAR_NAME.test(name)) {
						chunks.push(`\${${name}}`);
						i = end;
						continue;
					}
				}
			}
			if (template[i + 1] === "{") {
				const start = i + 2;
				const end = template.indexOf("}", start);
				if (end !== -1) {
					const name = template.slice(start, end);
					if (ENV_VAR_NAME.test(name)) {
						const val = env[name];
						if (val === void 0 || val === "") return null;
						chunks.push(val);
						i = end;
						continue;
					}
				}
			}
		}
		chunks.push(template[i]);
	}
	return chunks.join("");
}
/**
* Deep-walk the incoming config and restore `${VAR}` references from the
* pre-substitution parsed config wherever the resolved value matches.
*
* @param incoming - The resolved config about to be written
* @param parsed - The pre-substitution parsed config (from the current file on disk)
* @param env - Environment variables for verification
* @returns A new config object with env var references restored where appropriate
*/
function restoreEnvVarRefs(incoming, parsed, env = process.env) {
	if (parsed === null || parsed === void 0) return incoming;
	if (typeof incoming === "string" && typeof parsed === "string") {
		if (hasEnvVarRef(parsed)) {
			if (tryResolveString(parsed, env) === incoming) return parsed;
		}
		return incoming;
	}
	if (Array.isArray(incoming) && Array.isArray(parsed)) return incoming.map((item, i) => i < parsed.length ? restoreEnvVarRefs(item, parsed[i], env) : item);
	if (isPlainObject$1(incoming) && isPlainObject$1(parsed)) {
		const result = {};
		for (const [key, value] of Object.entries(incoming)) if (key in parsed) result[key] = restoreEnvVarRefs(value, parsed[key], env);
		else result[key] = value;
		return result;
	}
	return incoming;
}
//#endregion
//#region src/config/config-env-vars.ts
function isBlockedConfigEnvVar(key) {
	return isDangerousHostEnvVarName(key) || isDangerousHostEnvOverrideVarName(key);
}
function collectConfigEnvVarsByTarget(cfg) {
	const envConfig = cfg?.env;
	if (!envConfig) return {};
	const entries = {};
	if (envConfig.vars) for (const [rawKey, value] of Object.entries(envConfig.vars)) {
		if (!value) continue;
		const key = normalizeEnvVarKey(rawKey, { portable: true });
		if (!key) continue;
		if (isBlockedConfigEnvVar(key)) continue;
		entries[key] = value;
	}
	for (const [rawKey, value] of Object.entries(envConfig)) {
		if (rawKey === "shellEnv" || rawKey === "vars") continue;
		if (typeof value !== "string" || !value.trim()) continue;
		const key = normalizeEnvVarKey(rawKey, { portable: true });
		if (!key) continue;
		if (isBlockedConfigEnvVar(key)) continue;
		entries[key] = value;
	}
	return entries;
}
function collectConfigRuntimeEnvVars(cfg) {
	return collectConfigEnvVarsByTarget(cfg);
}
function collectConfigServiceEnvVars(cfg) {
	return collectConfigEnvVarsByTarget(cfg);
}
function createConfigRuntimeEnv(cfg, baseEnv = process.env) {
	const env = { ...baseEnv };
	applyConfigEnvVars(cfg, env);
	return env;
}
function applyConfigEnvVars(cfg, env = process.env) {
	const entries = collectConfigRuntimeEnvVars(cfg);
	for (const [key, value] of Object.entries(entries)) {
		if (env[key]?.trim()) continue;
		if (containsEnvVarReference(value)) continue;
		env[key] = value;
	}
}
//#endregion
//#region src/config/state-dir-dotenv.ts
function isBlockedServiceEnvVar(key) {
	return isDangerousHostEnvVarName(key) || isDangerousHostEnvOverrideVarName(key);
}
/**
* Read and parse `~/.openclaw/.env` (or `$OPENCLAW_STATE_DIR/.env`), returning
* a filtered record of key-value pairs suitable for embedding in a service
* environment (LaunchAgent plist, systemd unit, Scheduled Task).
*/
function readStateDirDotEnvVars(env) {
	const stateDir = resolveStateDir(env);
	const dotEnvPath = path.join(stateDir, ".env");
	let content;
	try {
		content = fsSync.readFileSync(dotEnvPath, "utf8");
	} catch {
		return {};
	}
	const parsed = dotenv.parse(content);
	const entries = {};
	for (const [rawKey, value] of Object.entries(parsed)) {
		if (!value?.trim()) continue;
		const key = normalizeEnvVarKey(rawKey, { portable: true });
		if (!key) continue;
		if (isBlockedServiceEnvVar(key)) continue;
		entries[key] = value;
	}
	return entries;
}
/**
* Durable service env sources survive beyond the invoking shell and are safe to
* persist into gateway install metadata.
*
* Precedence:
* 1. state-dir `.env` file vars
* 2. config service env vars
*/
function collectDurableServiceEnvVars(params) {
	return {
		...readStateDirDotEnvVars(params.env),
		...collectConfigServiceEnvVars(params.config)
	};
}
//#endregion
//#region src/config/legacy-migrate.ts
function migrateLegacyConfig(raw) {
	const { next, changes } = applyLegacyMigrations(raw);
	if (!next) return {
		config: null,
		changes: []
	};
	const validated = validateConfigObjectWithPlugins(next);
	if (!validated.ok) {
		changes.push("Migration applied, but config still invalid; fix remaining issues manually.");
		return {
			config: null,
			changes
		};
	}
	return {
		config: validated.config,
		changes
	};
}
//#endregion
//#region src/config/config-paths.ts
function parseConfigPath(raw) {
	const trimmed = raw.trim();
	if (!trimmed) return {
		ok: false,
		error: "Invalid path. Use dot notation (e.g. foo.bar)."
	};
	const parts = trimmed.split(".").map((part) => part.trim());
	if (parts.some((part) => !part)) return {
		ok: false,
		error: "Invalid path. Use dot notation (e.g. foo.bar)."
	};
	if (parts.some((part) => isBlockedObjectKey(part))) return {
		ok: false,
		error: "Invalid path segment."
	};
	return {
		ok: true,
		path: parts
	};
}
function setConfigValueAtPath(root, path, value) {
	let cursor = root;
	for (let idx = 0; idx < path.length - 1; idx += 1) {
		const key = path[idx];
		const next = cursor[key];
		if (!isPlainObject$1(next)) cursor[key] = {};
		cursor = cursor[key];
	}
	cursor[path[path.length - 1]] = value;
}
function unsetConfigValueAtPath(root, path) {
	const stack = [];
	let cursor = root;
	for (let idx = 0; idx < path.length - 1; idx += 1) {
		const key = path[idx];
		const next = cursor[key];
		if (!isPlainObject$1(next)) return false;
		stack.push({
			node: cursor,
			key
		});
		cursor = next;
	}
	const leafKey = path[path.length - 1];
	if (!(leafKey in cursor)) return false;
	delete cursor[leafKey];
	for (let idx = stack.length - 1; idx >= 0; idx -= 1) {
		const { node, key } = stack[idx];
		const child = node[key];
		if (isPlainObject$1(child) && Object.keys(child).length === 0) delete node[key];
		else break;
	}
	return true;
}
function getConfigValueAtPath(root, path) {
	let cursor = root;
	for (const key of path) {
		if (!isPlainObject$1(cursor)) return;
		cursor = cursor[key];
	}
	return cursor;
}
//#endregion
//#region src/config/runtime-overrides.ts
let overrides = {};
function sanitizeOverrideValue(value, seen = /* @__PURE__ */ new WeakSet()) {
	if (Array.isArray(value)) return value.map((entry) => sanitizeOverrideValue(entry, seen));
	if (!isPlainObject$1(value)) return value;
	if (seen.has(value)) return {};
	seen.add(value);
	const sanitized = {};
	for (const [key, entry] of Object.entries(value)) {
		if (entry === void 0 || isBlockedObjectKey(key)) continue;
		sanitized[key] = sanitizeOverrideValue(entry, seen);
	}
	seen.delete(value);
	return sanitized;
}
function mergeOverrides(base, override) {
	if (!isPlainObject$1(base) || !isPlainObject$1(override)) return override;
	const next = { ...base };
	for (const [key, value] of Object.entries(override)) {
		if (value === void 0 || isBlockedObjectKey(key)) continue;
		next[key] = mergeOverrides(base[key], value);
	}
	return next;
}
function getConfigOverrides() {
	return overrides;
}
function resetConfigOverrides() {
	overrides = {};
}
function setConfigOverride(pathRaw, value) {
	const parsed = parseConfigPath(pathRaw);
	if (!parsed.ok || !parsed.path) return {
		ok: false,
		error: parsed.error ?? "Invalid path."
	};
	setConfigValueAtPath(overrides, parsed.path, sanitizeOverrideValue(value));
	return { ok: true };
}
function unsetConfigOverride(pathRaw) {
	const parsed = parseConfigPath(pathRaw);
	if (!parsed.ok || !parsed.path) return {
		ok: false,
		removed: false,
		error: parsed.error ?? "Invalid path."
	};
	return {
		ok: true,
		removed: unsetConfigValueAtPath(overrides, parsed.path)
	};
}
function applyConfigOverrides(cfg) {
	if (!overrides || Object.keys(overrides).length === 0) return cfg;
	return mergeOverrides(cfg, overrides);
}
//#endregion
//#region src/config/version.ts
const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
function parseOpenClawVersion(raw) {
	if (!raw) return null;
	const match = normalizeLegacyDotBetaVersion(raw.trim()).match(VERSION_RE);
	if (!match) return null;
	const [, major, minor, patch, suffix] = match;
	const revision = suffix && /^[0-9]+$/.test(suffix) ? Number.parseInt(suffix, 10) : null;
	return {
		major: Number.parseInt(major, 10),
		minor: Number.parseInt(minor, 10),
		patch: Number.parseInt(patch, 10),
		revision,
		prerelease: suffix && revision == null ? suffix.split(".").filter(Boolean) : null
	};
}
function normalizeOpenClawVersionBase(raw) {
	const parsed = parseOpenClawVersion(raw);
	if (!parsed) return null;
	return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}
function isSameOpenClawStableFamily(a, b) {
	const parsedA = parseOpenClawVersion(a);
	const parsedB = parseOpenClawVersion(b);
	if (!parsedA || !parsedB) return false;
	if (parsedA.prerelease?.length || parsedB.prerelease?.length) return false;
	return parsedA.major === parsedB.major && parsedA.minor === parsedB.minor && parsedA.patch === parsedB.patch;
}
function compareOpenClawVersions(a, b) {
	const parsedA = parseOpenClawVersion(a);
	const parsedB = parseOpenClawVersion(b);
	if (!parsedA || !parsedB) return null;
	if (parsedA.major !== parsedB.major) return parsedA.major < parsedB.major ? -1 : 1;
	if (parsedA.minor !== parsedB.minor) return parsedA.minor < parsedB.minor ? -1 : 1;
	if (parsedA.patch !== parsedB.patch) return parsedA.patch < parsedB.patch ? -1 : 1;
	const rankA = releaseRank(parsedA);
	const rankB = releaseRank(parsedB);
	if (rankA !== rankB) return rankA < rankB ? -1 : 1;
	if (parsedA.revision != null && parsedB.revision != null && parsedA.revision !== parsedB.revision) return parsedA.revision < parsedB.revision ? -1 : 1;
	if (parsedA.prerelease || parsedB.prerelease) return comparePrereleaseIdentifiers(parsedA.prerelease, parsedB.prerelease);
	return 0;
}
function shouldWarnOnTouchedVersion(current, touched) {
	const parsedCurrent = parseOpenClawVersion(current);
	const parsedTouched = parseOpenClawVersion(touched);
	if (parsedCurrent && parsedTouched && parsedCurrent.major === parsedTouched.major && parsedCurrent.minor === parsedTouched.minor && parsedCurrent.patch === parsedTouched.patch && parsedTouched.revision != null) return false;
	if (isSameOpenClawStableFamily(current, touched)) return false;
	const cmp = compareOpenClawVersions(current, touched);
	return cmp !== null && cmp < 0;
}
function releaseRank(version) {
	if (version.prerelease?.length) return 0;
	if (version.revision != null) return 2;
	return 1;
}
//#endregion
//#region src/config/io.ts
const SHELL_ENV_EXPECTED_KEYS = [
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
	"DEEPSEEK_API_KEY",
	"ANTHROPIC_OAUTH_TOKEN",
	"GEMINI_API_KEY",
	"ZAI_API_KEY",
	"OPENROUTER_API_KEY",
	"AI_GATEWAY_API_KEY",
	"MINIMAX_API_KEY",
	"MODELSTUDIO_API_KEY",
	"SYNTHETIC_API_KEY",
	"KILOCODE_API_KEY",
	"ELEVENLABS_API_KEY",
	"TELEGRAM_BOT_TOKEN",
	"DISCORD_BOT_TOKEN",
	"SLACK_BOT_TOKEN",
	"SLACK_APP_TOKEN",
	"OPENCLAW_GATEWAY_TOKEN",
	"OPENCLAW_GATEWAY_PASSWORD"
];
const OPEN_DM_POLICY_ALLOW_FROM_RE = /^(?<policyPath>[a-z0-9_.-]+)\s*=\s*"open"\s+requires\s+(?<allowPath>[a-z0-9_.-]+)(?:\s+\(or\s+[a-z0-9_.-]+\))?\s+to include "\*"$/i;
const CONFIG_AUDIT_LOG_FILENAME = "config-audit.jsonl";
const CONFIG_HEALTH_STATE_FILENAME = "config-health.json";
const loggedInvalidConfigs = /* @__PURE__ */ new Set();
var ConfigRuntimeRefreshError = class extends Error {
	constructor(message, options) {
		super(message, options);
		this.name = "ConfigRuntimeRefreshError";
	}
};
function hashConfigRaw(raw) {
	return crypto.createHash("sha256").update(raw ?? "").digest("hex");
}
async function tightenStateDirPermissionsIfNeeded(params) {
	if (process.platform === "win32") return;
	const stateDir = resolveStateDir(params.env, params.homedir);
	const configDir = path.dirname(params.configPath);
	if (path.resolve(configDir) !== path.resolve(stateDir)) return;
	try {
		if (((await params.fsModule.promises.stat(configDir)).mode & 63) === 0) return;
		await params.fsModule.promises.chmod(configDir, 448);
	} catch {}
}
function formatConfigValidationFailure(pathLabel, issueMessage) {
	const match = issueMessage.match(OPEN_DM_POLICY_ALLOW_FROM_RE);
	const policyPath = match?.groups?.policyPath?.trim();
	const allowPath = match?.groups?.allowPath?.trim();
	if (!policyPath || !allowPath) return `Config validation failed: ${pathLabel}: ${issueMessage}`;
	return [
		`Config validation failed: ${pathLabel}`,
		"",
		`Configuration mismatch: ${policyPath} is "open", but ${allowPath} does not include "*".`,
		"",
		"Fix with:",
		`  openclaw config set ${allowPath} '["*"]'`,
		"",
		"Or switch policy:",
		`  openclaw config set ${policyPath} "pairing"`
	].join("\n");
}
function isNumericPathSegment(raw) {
	return /^[0-9]+$/.test(raw);
}
function isWritePlainObject(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function hasOwnObjectKey(value, key) {
	return Object.prototype.hasOwnProperty.call(value, key);
}
const WRITE_PRUNED_OBJECT = Symbol("write-pruned-object");
function unsetPathForWriteAt(value, pathSegments, depth) {
	if (depth >= pathSegments.length) return {
		changed: false,
		value
	};
	const segment = pathSegments[depth];
	const isLeaf = depth === pathSegments.length - 1;
	if (Array.isArray(value)) {
		if (!isNumericPathSegment(segment)) return {
			changed: false,
			value
		};
		const index = Number.parseInt(segment, 10);
		if (!Number.isFinite(index) || index < 0 || index >= value.length) return {
			changed: false,
			value
		};
		if (isLeaf) {
			const next = value.slice();
			next.splice(index, 1);
			return {
				changed: true,
				value: next
			};
		}
		const child = unsetPathForWriteAt(value[index], pathSegments, depth + 1);
		if (!child.changed) return {
			changed: false,
			value
		};
		const next = value.slice();
		if (child.value === WRITE_PRUNED_OBJECT) next.splice(index, 1);
		else next[index] = child.value;
		return {
			changed: true,
			value: next
		};
	}
	if (isBlockedObjectKey(segment) || !isWritePlainObject(value) || !hasOwnObjectKey(value, segment)) return {
		changed: false,
		value
	};
	if (isLeaf) {
		const next = { ...value };
		delete next[segment];
		return {
			changed: true,
			value: Object.keys(next).length === 0 ? WRITE_PRUNED_OBJECT : next
		};
	}
	const child = unsetPathForWriteAt(value[segment], pathSegments, depth + 1);
	if (!child.changed) return {
		changed: false,
		value
	};
	const next = { ...value };
	if (child.value === WRITE_PRUNED_OBJECT) delete next[segment];
	else next[segment] = child.value;
	return {
		changed: true,
		value: Object.keys(next).length === 0 ? WRITE_PRUNED_OBJECT : next
	};
}
function unsetPathForWrite(root, pathSegments) {
	if (pathSegments.length === 0) return {
		changed: false,
		next: root
	};
	const result = unsetPathForWriteAt(root, pathSegments, 0);
	if (!result.changed) return {
		changed: false,
		next: root
	};
	if (result.value === WRITE_PRUNED_OBJECT) return {
		changed: true,
		next: {}
	};
	if (isWritePlainObject(result.value)) return {
		changed: true,
		next: coerceConfig(result.value)
	};
	return {
		changed: false,
		next: root
	};
}
function resolveConfigSnapshotHash(snapshot) {
	if (typeof snapshot.hash === "string") {
		const trimmed = snapshot.hash.trim();
		if (trimmed) return trimmed;
	}
	if (typeof snapshot.raw !== "string") return null;
	return hashConfigRaw(snapshot.raw);
}
function coerceConfig(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value;
}
function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasConfigMeta(value) {
	if (!isPlainObject(value)) return false;
	const meta = value.meta;
	return isPlainObject(meta);
}
function resolveGatewayMode(value) {
	if (!isPlainObject(value)) return null;
	const gateway = value.gateway;
	if (!isPlainObject(gateway) || typeof gateway.mode !== "string") return null;
	const trimmed = gateway.mode.trim();
	return trimmed.length > 0 ? trimmed : null;
}
function cloneUnknown(value) {
	return structuredClone(value);
}
function createMergePatch(base, target) {
	if (!isPlainObject(base) || !isPlainObject(target)) return cloneUnknown(target);
	const patch = {};
	const keys = new Set([...Object.keys(base), ...Object.keys(target)]);
	for (const key of keys) {
		const hasBase = key in base;
		if (!(key in target)) {
			patch[key] = null;
			continue;
		}
		const targetValue = target[key];
		if (!hasBase) {
			patch[key] = cloneUnknown(targetValue);
			continue;
		}
		const baseValue = base[key];
		if (isPlainObject(baseValue) && isPlainObject(targetValue)) {
			const childPatch = createMergePatch(baseValue, targetValue);
			if (isPlainObject(childPatch) && Object.keys(childPatch).length === 0) continue;
			patch[key] = childPatch;
			continue;
		}
		if (!isDeepStrictEqual(baseValue, targetValue)) patch[key] = cloneUnknown(targetValue);
	}
	return patch;
}
function collectEnvRefPaths(value, path, output) {
	if (typeof value === "string") {
		if (containsEnvVarReference(value)) output.set(path, value);
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) => {
			collectEnvRefPaths(item, `${path}[${index}]`, output);
		});
		return;
	}
	if (isPlainObject(value)) for (const [key, child] of Object.entries(value)) collectEnvRefPaths(child, path ? `${path}.${key}` : key, output);
}
function collectChangedPaths(base, target, path, output) {
	if (Array.isArray(base) && Array.isArray(target)) {
		const max = Math.max(base.length, target.length);
		for (let index = 0; index < max; index += 1) {
			const childPath = path ? `${path}[${index}]` : `[${index}]`;
			if (index >= base.length || index >= target.length) {
				output.add(childPath);
				continue;
			}
			collectChangedPaths(base[index], target[index], childPath, output);
		}
		return;
	}
	if (isPlainObject(base) && isPlainObject(target)) {
		const keys = new Set([...Object.keys(base), ...Object.keys(target)]);
		for (const key of keys) {
			const childPath = path ? `${path}.${key}` : key;
			const hasBase = key in base;
			if (!(key in target) || !hasBase) {
				output.add(childPath);
				continue;
			}
			collectChangedPaths(base[key], target[key], childPath, output);
		}
		return;
	}
	if (!isDeepStrictEqual(base, target)) output.add(path);
}
function parentPath(value) {
	if (!value) return "";
	if (value.endsWith("]")) {
		const index = value.lastIndexOf("[");
		return index > 0 ? value.slice(0, index) : "";
	}
	const index = value.lastIndexOf(".");
	return index >= 0 ? value.slice(0, index) : "";
}
function isPathChanged(path, changedPaths) {
	if (changedPaths.has(path)) return true;
	let current = parentPath(path);
	while (current) {
		if (changedPaths.has(current)) return true;
		current = parentPath(current);
	}
	return changedPaths.has("");
}
function restoreEnvRefsFromMap(value, path, envRefMap, changedPaths) {
	if (typeof value === "string") {
		if (!isPathChanged(path, changedPaths)) {
			const original = envRefMap.get(path);
			if (original !== void 0) return original;
		}
		return value;
	}
	if (Array.isArray(value)) {
		let changed = false;
		const next = value.map((item, index) => {
			const updated = restoreEnvRefsFromMap(item, `${path}[${index}]`, envRefMap, changedPaths);
			if (updated !== item) changed = true;
			return updated;
		});
		return changed ? next : value;
	}
	if (isPlainObject(value)) {
		let changed = false;
		const next = {};
		for (const [key, child] of Object.entries(value)) {
			const updated = restoreEnvRefsFromMap(child, path ? `${path}.${key}` : key, envRefMap, changedPaths);
			if (updated !== child) changed = true;
			next[key] = updated;
		}
		return changed ? next : value;
	}
	return value;
}
function resolveConfigAuditLogPath(env, homedir) {
	return path.join(resolveStateDir(env, homedir), "logs", CONFIG_AUDIT_LOG_FILENAME);
}
function resolveConfigHealthStatePath(env, homedir) {
	return path.join(resolveStateDir(env, homedir), "logs", CONFIG_HEALTH_STATE_FILENAME);
}
function normalizeStatNumber(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function normalizeStatId(value) {
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return null;
}
function resolveConfigStatMetadata(stat) {
	return {
		dev: normalizeStatId(stat?.dev ?? null),
		ino: normalizeStatId(stat?.ino ?? null),
		mode: normalizeStatNumber(stat ? stat.mode & 511 : null),
		nlink: normalizeStatNumber(stat?.nlink ?? null),
		uid: normalizeStatNumber(stat?.uid ?? null),
		gid: normalizeStatNumber(stat?.gid ?? null)
	};
}
function resolveConfigWriteSuspiciousReasons(params) {
	const reasons = [];
	if (!params.existsBefore) return reasons;
	if (typeof params.previousBytes === "number" && typeof params.nextBytes === "number" && params.previousBytes >= 512 && params.nextBytes < Math.floor(params.previousBytes * .5)) reasons.push(`size-drop:${params.previousBytes}->${params.nextBytes}`);
	if (!params.hasMetaBefore) reasons.push("missing-meta-before-write");
	if (params.gatewayModeBefore && !params.gatewayModeAfter) reasons.push("gateway-mode-removed");
	return reasons;
}
async function appendConfigAuditRecord(deps, record) {
	try {
		const auditPath = resolveConfigAuditLogPath(deps.env, deps.homedir);
		await deps.fs.promises.mkdir(path.dirname(auditPath), {
			recursive: true,
			mode: 448
		});
		await deps.fs.promises.appendFile(auditPath, `${JSON.stringify(record)}\n`, {
			encoding: "utf-8",
			mode: 384
		});
	} catch {}
}
function appendConfigAuditRecordSync(deps, record) {
	try {
		const auditPath = resolveConfigAuditLogPath(deps.env, deps.homedir);
		deps.fs.mkdirSync(path.dirname(auditPath), {
			recursive: true,
			mode: 448
		});
		deps.fs.appendFileSync(auditPath, `${JSON.stringify(record)}\n`, {
			encoding: "utf-8",
			mode: 384
		});
	} catch {}
}
async function readConfigHealthState(deps) {
	try {
		const healthPath = resolveConfigHealthStatePath(deps.env, deps.homedir);
		const raw = await deps.fs.promises.readFile(healthPath, "utf-8");
		const parsed = JSON.parse(raw);
		return isPlainObject(parsed) ? parsed : {};
	} catch {
		return {};
	}
}
function readConfigHealthStateSync(deps) {
	try {
		const healthPath = resolveConfigHealthStatePath(deps.env, deps.homedir);
		const raw = deps.fs.readFileSync(healthPath, "utf-8");
		const parsed = JSON.parse(raw);
		return isPlainObject(parsed) ? parsed : {};
	} catch {
		return {};
	}
}
async function writeConfigHealthState(deps, state) {
	try {
		const healthPath = resolveConfigHealthStatePath(deps.env, deps.homedir);
		await deps.fs.promises.mkdir(path.dirname(healthPath), {
			recursive: true,
			mode: 448
		});
		await deps.fs.promises.writeFile(healthPath, `${JSON.stringify(state, null, 2)}\n`, {
			encoding: "utf-8",
			mode: 384
		});
	} catch {}
}
function writeConfigHealthStateSync(deps, state) {
	try {
		const healthPath = resolveConfigHealthStatePath(deps.env, deps.homedir);
		deps.fs.mkdirSync(path.dirname(healthPath), {
			recursive: true,
			mode: 448
		});
		deps.fs.writeFileSync(healthPath, `${JSON.stringify(state, null, 2)}\n`, {
			encoding: "utf-8",
			mode: 384
		});
	} catch {}
}
function getConfigHealthEntry(state, configPath) {
	const entries = state.entries;
	if (!entries || !isPlainObject(entries)) return {};
	const entry = entries[configPath];
	return entry && isPlainObject(entry) ? entry : {};
}
function setConfigHealthEntry(state, configPath, entry) {
	return {
		...state,
		entries: {
			...state.entries,
			[configPath]: entry
		}
	};
}
function isUpdateChannelOnlyRoot(value) {
	if (!isPlainObject(value)) return false;
	const keys = Object.keys(value);
	if (keys.length !== 1 || keys[0] !== "update") return false;
	const update = value.update;
	if (!isPlainObject(update)) return false;
	return Object.keys(update).length === 1 && typeof update.channel === "string";
}
function resolveConfigObserveSuspiciousReasons(params) {
	const reasons = [];
	const baseline = params.lastKnownGood;
	if (!baseline) return reasons;
	if (baseline.bytes >= 512 && params.bytes < Math.floor(baseline.bytes * .5)) reasons.push(`size-drop-vs-last-good:${baseline.bytes}->${params.bytes}`);
	if (baseline.hasMeta && !params.hasMeta) reasons.push("missing-meta-vs-last-good");
	if (baseline.gatewayMode && !params.gatewayMode) reasons.push("gateway-mode-missing-vs-last-good");
	if (baseline.gatewayMode && isUpdateChannelOnlyRoot(params.parsed)) reasons.push("update-channel-only-root");
	return reasons;
}
async function readConfigFingerprintForPath(deps, targetPath) {
	try {
		const raw = await deps.fs.promises.readFile(targetPath, "utf-8");
		const stat = await deps.fs.promises.stat(targetPath).catch(() => null);
		const parsedRes = parseConfigJson5(raw, deps.json5);
		const parsed = parsedRes.ok ? parsedRes.parsed : {};
		return {
			hash: hashConfigRaw(raw),
			bytes: Buffer.byteLength(raw, "utf-8"),
			mtimeMs: stat?.mtimeMs ?? null,
			ctimeMs: stat?.ctimeMs ?? null,
			...resolveConfigStatMetadata(stat),
			hasMeta: hasConfigMeta(parsed),
			gatewayMode: resolveGatewayMode(parsed),
			observedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
	} catch {
		return null;
	}
}
function readConfigFingerprintForPathSync(deps, targetPath) {
	try {
		const raw = deps.fs.readFileSync(targetPath, "utf-8");
		const stat = deps.fs.statSync(targetPath, { throwIfNoEntry: false }) ?? null;
		const parsedRes = parseConfigJson5(raw, deps.json5);
		const parsed = parsedRes.ok ? parsedRes.parsed : {};
		return {
			hash: hashConfigRaw(raw),
			bytes: Buffer.byteLength(raw, "utf-8"),
			mtimeMs: stat?.mtimeMs ?? null,
			ctimeMs: stat?.ctimeMs ?? null,
			...resolveConfigStatMetadata(stat),
			hasMeta: hasConfigMeta(parsed),
			gatewayMode: resolveGatewayMode(parsed),
			observedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
	} catch {
		return null;
	}
}
function formatConfigArtifactTimestamp(ts) {
	return ts.replaceAll(":", "-").replaceAll(".", "-");
}
async function persistClobberedConfigSnapshot(params) {
	const targetPath = `${params.configPath}.clobbered.${formatConfigArtifactTimestamp(params.observedAt)}`;
	try {
		await params.deps.fs.promises.writeFile(targetPath, params.raw, {
			encoding: "utf-8",
			mode: 384,
			flag: "wx"
		});
		return targetPath;
	} catch {
		return null;
	}
}
function persistClobberedConfigSnapshotSync(params) {
	const targetPath = `${params.configPath}.clobbered.${formatConfigArtifactTimestamp(params.observedAt)}`;
	try {
		params.deps.fs.writeFileSync(targetPath, params.raw, {
			encoding: "utf-8",
			mode: 384,
			flag: "wx"
		});
		return targetPath;
	} catch {
		return null;
	}
}
async function maybeRecoverSuspiciousConfigRead(params) {
	const stat = await params.deps.fs.promises.stat(params.configPath).catch(() => null);
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const current = {
		hash: hashConfigRaw(params.raw),
		bytes: Buffer.byteLength(params.raw, "utf-8"),
		mtimeMs: stat?.mtimeMs ?? null,
		ctimeMs: stat?.ctimeMs ?? null,
		...resolveConfigStatMetadata(stat),
		hasMeta: hasConfigMeta(params.parsed),
		gatewayMode: resolveGatewayMode(params.parsed),
		observedAt: now
	};
	let healthState = await readConfigHealthState(params.deps);
	const entry = getConfigHealthEntry(healthState, params.configPath);
	const backupPath = `${params.configPath}.bak`;
	const backupBaseline = entry.lastKnownGood ?? await readConfigFingerprintForPath(params.deps, backupPath) ?? void 0;
	const suspicious = resolveConfigObserveSuspiciousReasons({
		bytes: current.bytes,
		hasMeta: current.hasMeta,
		gatewayMode: current.gatewayMode,
		parsed: params.parsed,
		lastKnownGood: backupBaseline
	});
	if (!suspicious.includes("update-channel-only-root")) return {
		raw: params.raw,
		parsed: params.parsed
	};
	const suspiciousSignature = `${current.hash}:${suspicious.join(",")}`;
	const backupRaw = await params.deps.fs.promises.readFile(backupPath, "utf-8").catch(() => null);
	if (!backupRaw) return {
		raw: params.raw,
		parsed: params.parsed
	};
	const backupParsedRes = parseConfigJson5(backupRaw, params.deps.json5);
	if (!backupParsedRes.ok) return {
		raw: params.raw,
		parsed: params.parsed
	};
	const backup = backupBaseline ?? await readConfigFingerprintForPath(params.deps, backupPath);
	if (!backup?.gatewayMode) return {
		raw: params.raw,
		parsed: params.parsed
	};
	const clobberedPath = await persistClobberedConfigSnapshot({
		deps: params.deps,
		configPath: params.configPath,
		raw: params.raw,
		observedAt: now
	});
	let restoredFromBackup = false;
	try {
		await params.deps.fs.promises.copyFile(backupPath, params.configPath);
		restoredFromBackup = true;
	} catch {}
	params.deps.logger.warn(`Config auto-restored from backup: ${params.configPath} (${suspicious.join(", ")})`);
	await appendConfigAuditRecord(params.deps, {
		ts: now,
		source: "config-io",
		event: "config.observe",
		phase: "read",
		configPath: params.configPath,
		pid: process.pid,
		ppid: process.ppid,
		cwd: process.cwd(),
		argv: process.argv.slice(0, 8),
		execArgv: process.execArgv.slice(0, 8),
		exists: true,
		valid: true,
		hash: current.hash,
		bytes: current.bytes,
		mtimeMs: current.mtimeMs,
		ctimeMs: current.ctimeMs,
		dev: current.dev,
		ino: current.ino,
		mode: current.mode,
		nlink: current.nlink,
		uid: current.uid,
		gid: current.gid,
		hasMeta: current.hasMeta,
		gatewayMode: current.gatewayMode,
		suspicious,
		lastKnownGoodHash: entry.lastKnownGood?.hash ?? null,
		lastKnownGoodBytes: entry.lastKnownGood?.bytes ?? null,
		lastKnownGoodMtimeMs: entry.lastKnownGood?.mtimeMs ?? null,
		lastKnownGoodCtimeMs: entry.lastKnownGood?.ctimeMs ?? null,
		lastKnownGoodDev: entry.lastKnownGood?.dev ?? null,
		lastKnownGoodIno: entry.lastKnownGood?.ino ?? null,
		lastKnownGoodMode: entry.lastKnownGood?.mode ?? null,
		lastKnownGoodNlink: entry.lastKnownGood?.nlink ?? null,
		lastKnownGoodUid: entry.lastKnownGood?.uid ?? null,
		lastKnownGoodGid: entry.lastKnownGood?.gid ?? null,
		lastKnownGoodGatewayMode: entry.lastKnownGood?.gatewayMode ?? null,
		backupHash: backup?.hash ?? null,
		backupBytes: backup?.bytes ?? null,
		backupMtimeMs: backup?.mtimeMs ?? null,
		backupCtimeMs: backup?.ctimeMs ?? null,
		backupDev: backup?.dev ?? null,
		backupIno: backup?.ino ?? null,
		backupMode: backup?.mode ?? null,
		backupNlink: backup?.nlink ?? null,
		backupUid: backup?.uid ?? null,
		backupGid: backup?.gid ?? null,
		backupGatewayMode: backup?.gatewayMode ?? null,
		clobberedPath,
		restoredFromBackup,
		restoredBackupPath: backupPath
	});
	healthState = setConfigHealthEntry(healthState, params.configPath, {
		...entry,
		lastObservedSuspiciousSignature: suspiciousSignature
	});
	await writeConfigHealthState(params.deps, healthState);
	return {
		raw: backupRaw,
		parsed: backupParsedRes.parsed
	};
}
function maybeRecoverSuspiciousConfigReadSync(params) {
	const stat = params.deps.fs.statSync(params.configPath, { throwIfNoEntry: false }) ?? null;
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const current = {
		hash: hashConfigRaw(params.raw),
		bytes: Buffer.byteLength(params.raw, "utf-8"),
		mtimeMs: stat?.mtimeMs ?? null,
		ctimeMs: stat?.ctimeMs ?? null,
		...resolveConfigStatMetadata(stat),
		hasMeta: hasConfigMeta(params.parsed),
		gatewayMode: resolveGatewayMode(params.parsed),
		observedAt: now
	};
	let healthState = readConfigHealthStateSync(params.deps);
	const entry = getConfigHealthEntry(healthState, params.configPath);
	const backupPath = `${params.configPath}.bak`;
	const backupBaseline = entry.lastKnownGood ?? readConfigFingerprintForPathSync(params.deps, backupPath) ?? void 0;
	const suspicious = resolveConfigObserveSuspiciousReasons({
		bytes: current.bytes,
		hasMeta: current.hasMeta,
		gatewayMode: current.gatewayMode,
		parsed: params.parsed,
		lastKnownGood: backupBaseline
	});
	if (!suspicious.includes("update-channel-only-root")) return {
		raw: params.raw,
		parsed: params.parsed
	};
	const suspiciousSignature = `${current.hash}:${suspicious.join(",")}`;
	let backupRaw;
	try {
		backupRaw = params.deps.fs.readFileSync(backupPath, "utf-8");
	} catch {
		return {
			raw: params.raw,
			parsed: params.parsed
		};
	}
	const backupParsedRes = parseConfigJson5(backupRaw, params.deps.json5);
	if (!backupParsedRes.ok) return {
		raw: params.raw,
		parsed: params.parsed
	};
	const backup = backupBaseline ?? readConfigFingerprintForPathSync(params.deps, backupPath);
	if (!backup?.gatewayMode) return {
		raw: params.raw,
		parsed: params.parsed
	};
	const clobberedPath = persistClobberedConfigSnapshotSync({
		deps: params.deps,
		configPath: params.configPath,
		raw: params.raw,
		observedAt: now
	});
	let restoredFromBackup = false;
	try {
		params.deps.fs.copyFileSync(backupPath, params.configPath);
		restoredFromBackup = true;
	} catch {}
	params.deps.logger.warn(`Config auto-restored from backup: ${params.configPath} (${suspicious.join(", ")})`);
	appendConfigAuditRecordSync(params.deps, {
		ts: now,
		source: "config-io",
		event: "config.observe",
		phase: "read",
		configPath: params.configPath,
		pid: process.pid,
		ppid: process.ppid,
		cwd: process.cwd(),
		argv: process.argv.slice(0, 8),
		execArgv: process.execArgv.slice(0, 8),
		exists: true,
		valid: true,
		hash: current.hash,
		bytes: current.bytes,
		mtimeMs: current.mtimeMs,
		ctimeMs: current.ctimeMs,
		dev: current.dev,
		ino: current.ino,
		mode: current.mode,
		nlink: current.nlink,
		uid: current.uid,
		gid: current.gid,
		hasMeta: current.hasMeta,
		gatewayMode: current.gatewayMode,
		suspicious,
		lastKnownGoodHash: entry.lastKnownGood?.hash ?? null,
		lastKnownGoodBytes: entry.lastKnownGood?.bytes ?? null,
		lastKnownGoodMtimeMs: entry.lastKnownGood?.mtimeMs ?? null,
		lastKnownGoodCtimeMs: entry.lastKnownGood?.ctimeMs ?? null,
		lastKnownGoodDev: entry.lastKnownGood?.dev ?? null,
		lastKnownGoodIno: entry.lastKnownGood?.ino ?? null,
		lastKnownGoodMode: entry.lastKnownGood?.mode ?? null,
		lastKnownGoodNlink: entry.lastKnownGood?.nlink ?? null,
		lastKnownGoodUid: entry.lastKnownGood?.uid ?? null,
		lastKnownGoodGid: entry.lastKnownGood?.gid ?? null,
		lastKnownGoodGatewayMode: entry.lastKnownGood?.gatewayMode ?? null,
		backupHash: backup?.hash ?? null,
		backupBytes: backup?.bytes ?? null,
		backupMtimeMs: backup?.mtimeMs ?? null,
		backupCtimeMs: backup?.ctimeMs ?? null,
		backupDev: backup?.dev ?? null,
		backupIno: backup?.ino ?? null,
		backupMode: backup?.mode ?? null,
		backupNlink: backup?.nlink ?? null,
		backupUid: backup?.uid ?? null,
		backupGid: backup?.gid ?? null,
		backupGatewayMode: backup?.gatewayMode ?? null,
		clobberedPath,
		restoredFromBackup,
		restoredBackupPath: backupPath
	});
	healthState = setConfigHealthEntry(healthState, params.configPath, {
		...entry,
		lastObservedSuspiciousSignature: suspiciousSignature
	});
	writeConfigHealthStateSync(params.deps, healthState);
	return {
		raw: backupRaw,
		parsed: backupParsedRes.parsed
	};
}
function sameFingerprint(left, right) {
	if (!left) return false;
	return left.hash === right.hash && left.bytes === right.bytes && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.dev === right.dev && left.ino === right.ino && left.mode === right.mode && left.nlink === right.nlink && left.uid === right.uid && left.gid === right.gid && left.hasMeta === right.hasMeta && left.gatewayMode === right.gatewayMode;
}
async function observeConfigSnapshot(deps, snapshot) {
	if (!snapshot.exists || typeof snapshot.raw !== "string") return;
	const stat = await deps.fs.promises.stat(snapshot.path).catch(() => null);
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const current = {
		hash: resolveConfigSnapshotHash(snapshot) ?? hashConfigRaw(snapshot.raw),
		bytes: Buffer.byteLength(snapshot.raw, "utf-8"),
		mtimeMs: stat?.mtimeMs ?? null,
		ctimeMs: stat?.ctimeMs ?? null,
		...resolveConfigStatMetadata(stat),
		hasMeta: hasConfigMeta(snapshot.parsed),
		gatewayMode: resolveGatewayMode(snapshot.resolved),
		observedAt: now
	};
	let healthState = await readConfigHealthState(deps);
	const entry = getConfigHealthEntry(healthState, snapshot.path);
	const backupBaseline = entry.lastKnownGood ?? await readConfigFingerprintForPath(deps, `${snapshot.path}.bak`) ?? void 0;
	const suspicious = resolveConfigObserveSuspiciousReasons({
		bytes: current.bytes,
		hasMeta: current.hasMeta,
		gatewayMode: current.gatewayMode,
		parsed: snapshot.parsed,
		lastKnownGood: backupBaseline
	});
	if (suspicious.length === 0) {
		if (snapshot.valid) {
			const nextEntry = {
				lastKnownGood: current,
				lastObservedSuspiciousSignature: null
			};
			if (!sameFingerprint(entry.lastKnownGood, current) || entry.lastObservedSuspiciousSignature !== null) {
				healthState = setConfigHealthEntry(healthState, snapshot.path, nextEntry);
				await writeConfigHealthState(deps, healthState);
			}
		}
		return;
	}
	const suspiciousSignature = `${current.hash}:${suspicious.join(",")}`;
	if (entry.lastObservedSuspiciousSignature === suspiciousSignature) return;
	const backup = (backupBaseline?.hash ? backupBaseline : null) ?? await readConfigFingerprintForPath(deps, `${snapshot.path}.bak`);
	const clobberedPath = await persistClobberedConfigSnapshot({
		deps,
		configPath: snapshot.path,
		raw: snapshot.raw,
		observedAt: now
	});
	deps.logger.warn(`Config observe anomaly: ${snapshot.path} (${suspicious.join(", ")})`);
	await appendConfigAuditRecord(deps, {
		ts: now,
		source: "config-io",
		event: "config.observe",
		phase: "read",
		configPath: snapshot.path,
		pid: process.pid,
		ppid: process.ppid,
		cwd: process.cwd(),
		argv: process.argv.slice(0, 8),
		execArgv: process.execArgv.slice(0, 8),
		exists: true,
		valid: snapshot.valid,
		hash: current.hash,
		bytes: current.bytes,
		mtimeMs: current.mtimeMs,
		ctimeMs: current.ctimeMs,
		dev: current.dev,
		ino: current.ino,
		mode: current.mode,
		nlink: current.nlink,
		uid: current.uid,
		gid: current.gid,
		hasMeta: current.hasMeta,
		gatewayMode: current.gatewayMode,
		suspicious,
		lastKnownGoodHash: entry.lastKnownGood?.hash ?? null,
		lastKnownGoodBytes: entry.lastKnownGood?.bytes ?? null,
		lastKnownGoodMtimeMs: entry.lastKnownGood?.mtimeMs ?? null,
		lastKnownGoodCtimeMs: entry.lastKnownGood?.ctimeMs ?? null,
		lastKnownGoodDev: entry.lastKnownGood?.dev ?? null,
		lastKnownGoodIno: entry.lastKnownGood?.ino ?? null,
		lastKnownGoodMode: entry.lastKnownGood?.mode ?? null,
		lastKnownGoodNlink: entry.lastKnownGood?.nlink ?? null,
		lastKnownGoodUid: entry.lastKnownGood?.uid ?? null,
		lastKnownGoodGid: entry.lastKnownGood?.gid ?? null,
		lastKnownGoodGatewayMode: entry.lastKnownGood?.gatewayMode ?? null,
		backupHash: backup?.hash ?? null,
		backupBytes: backup?.bytes ?? null,
		backupMtimeMs: backup?.mtimeMs ?? null,
		backupCtimeMs: backup?.ctimeMs ?? null,
		backupDev: backup?.dev ?? null,
		backupIno: backup?.ino ?? null,
		backupMode: backup?.mode ?? null,
		backupNlink: backup?.nlink ?? null,
		backupUid: backup?.uid ?? null,
		backupGid: backup?.gid ?? null,
		backupGatewayMode: backup?.gatewayMode ?? null,
		clobberedPath,
		restoredFromBackup: false,
		restoredBackupPath: null
	});
	healthState = setConfigHealthEntry(healthState, snapshot.path, {
		...entry,
		lastObservedSuspiciousSignature: suspiciousSignature
	});
	await writeConfigHealthState(deps, healthState);
}
function observeConfigSnapshotSync(deps, snapshot) {
	if (!snapshot.exists || typeof snapshot.raw !== "string") return;
	const stat = deps.fs.statSync(snapshot.path, { throwIfNoEntry: false }) ?? null;
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const current = {
		hash: resolveConfigSnapshotHash(snapshot) ?? hashConfigRaw(snapshot.raw),
		bytes: Buffer.byteLength(snapshot.raw, "utf-8"),
		mtimeMs: stat?.mtimeMs ?? null,
		ctimeMs: stat?.ctimeMs ?? null,
		...resolveConfigStatMetadata(stat),
		hasMeta: hasConfigMeta(snapshot.parsed),
		gatewayMode: resolveGatewayMode(snapshot.resolved),
		observedAt: now
	};
	let healthState = readConfigHealthStateSync(deps);
	const entry = getConfigHealthEntry(healthState, snapshot.path);
	const backupBaseline = entry.lastKnownGood ?? readConfigFingerprintForPathSync(deps, `${snapshot.path}.bak`) ?? void 0;
	const suspicious = resolveConfigObserveSuspiciousReasons({
		bytes: current.bytes,
		hasMeta: current.hasMeta,
		gatewayMode: current.gatewayMode,
		parsed: snapshot.parsed,
		lastKnownGood: backupBaseline
	});
	if (suspicious.length === 0) {
		if (snapshot.valid) {
			const nextEntry = {
				lastKnownGood: current,
				lastObservedSuspiciousSignature: null
			};
			if (!sameFingerprint(entry.lastKnownGood, current) || entry.lastObservedSuspiciousSignature !== null) {
				healthState = setConfigHealthEntry(healthState, snapshot.path, nextEntry);
				writeConfigHealthStateSync(deps, healthState);
			}
		}
		return;
	}
	const suspiciousSignature = `${current.hash}:${suspicious.join(",")}`;
	if (entry.lastObservedSuspiciousSignature === suspiciousSignature) return;
	const backup = (backupBaseline?.hash ? backupBaseline : null) ?? readConfigFingerprintForPathSync(deps, `${snapshot.path}.bak`);
	const clobberedPath = persistClobberedConfigSnapshotSync({
		deps,
		configPath: snapshot.path,
		raw: snapshot.raw,
		observedAt: now
	});
	deps.logger.warn(`Config observe anomaly: ${snapshot.path} (${suspicious.join(", ")})`);
	appendConfigAuditRecordSync(deps, {
		ts: now,
		source: "config-io",
		event: "config.observe",
		phase: "read",
		configPath: snapshot.path,
		pid: process.pid,
		ppid: process.ppid,
		cwd: process.cwd(),
		argv: process.argv.slice(0, 8),
		execArgv: process.execArgv.slice(0, 8),
		exists: true,
		valid: snapshot.valid,
		hash: current.hash,
		bytes: current.bytes,
		mtimeMs: current.mtimeMs,
		ctimeMs: current.ctimeMs,
		dev: current.dev,
		ino: current.ino,
		mode: current.mode,
		nlink: current.nlink,
		uid: current.uid,
		gid: current.gid,
		hasMeta: current.hasMeta,
		gatewayMode: current.gatewayMode,
		suspicious,
		lastKnownGoodHash: entry.lastKnownGood?.hash ?? null,
		lastKnownGoodBytes: entry.lastKnownGood?.bytes ?? null,
		lastKnownGoodMtimeMs: entry.lastKnownGood?.mtimeMs ?? null,
		lastKnownGoodCtimeMs: entry.lastKnownGood?.ctimeMs ?? null,
		lastKnownGoodDev: entry.lastKnownGood?.dev ?? null,
		lastKnownGoodIno: entry.lastKnownGood?.ino ?? null,
		lastKnownGoodMode: entry.lastKnownGood?.mode ?? null,
		lastKnownGoodNlink: entry.lastKnownGood?.nlink ?? null,
		lastKnownGoodUid: entry.lastKnownGood?.uid ?? null,
		lastKnownGoodGid: entry.lastKnownGood?.gid ?? null,
		lastKnownGoodGatewayMode: entry.lastKnownGood?.gatewayMode ?? null,
		backupHash: backup?.hash ?? null,
		backupBytes: backup?.bytes ?? null,
		backupMtimeMs: backup?.mtimeMs ?? null,
		backupCtimeMs: backup?.ctimeMs ?? null,
		backupDev: backup?.dev ?? null,
		backupIno: backup?.ino ?? null,
		backupMode: backup?.mode ?? null,
		backupNlink: backup?.nlink ?? null,
		backupUid: backup?.uid ?? null,
		backupGid: backup?.gid ?? null,
		backupGatewayMode: backup?.gatewayMode ?? null,
		clobberedPath,
		restoredFromBackup: false,
		restoredBackupPath: null
	});
	healthState = setConfigHealthEntry(healthState, snapshot.path, {
		...entry,
		lastObservedSuspiciousSignature: suspiciousSignature
	});
	writeConfigHealthStateSync(deps, healthState);
}
function warnOnConfigMiskeys(raw, logger) {
	if (!raw || typeof raw !== "object") return;
	const gateway = raw.gateway;
	if (!gateway || typeof gateway !== "object") return;
	if ("token" in gateway) logger.warn("Config uses \"gateway.token\". This key is ignored; use \"gateway.auth.token\" instead.");
}
function stampConfigVersion(cfg) {
	const now = (/* @__PURE__ */ new Date()).toISOString();
	return {
		...cfg,
		meta: {
			...cfg.meta,
			lastTouchedVersion: VERSION,
			lastTouchedAt: now
		}
	};
}
function warnIfConfigFromFuture(cfg, logger) {
	const touched = cfg.meta?.lastTouchedVersion;
	if (!touched) return;
	if (shouldWarnOnTouchedVersion(VERSION, touched)) logger.warn(`Config was last written by a newer OpenClaw (${touched}); current version is ${VERSION}.`);
}
function resolveConfigPathForDeps(deps) {
	if (deps.configPath) return deps.configPath;
	return resolveConfigPath(deps.env, resolveStateDir(deps.env, deps.homedir));
}
function normalizeDeps(overrides = {}) {
	return {
		fs: overrides.fs ?? fsSync,
		json5: overrides.json5 ?? JSON5,
		env: overrides.env ?? process.env,
		homedir: overrides.homedir ?? (() => resolveRequiredHomeDir(overrides.env ?? process.env, os.homedir)),
		configPath: overrides.configPath ?? "",
		logger: overrides.logger ?? console
	};
}
function maybeLoadDotEnvForConfig(env) {
	if (env !== process.env) return;
	loadDotEnv({ quiet: true });
}
function parseConfigJson5(raw, json5 = JSON5) {
	try {
		return {
			ok: true,
			parsed: json5.parse(raw)
		};
	} catch (err) {
		return {
			ok: false,
			error: String(err)
		};
	}
}
function resolveConfigIncludesForRead(parsed, configPath, deps) {
	return resolveConfigIncludes(parsed, configPath, {
		readFile: (candidate) => deps.fs.readFileSync(candidate, "utf-8"),
		readFileWithGuards: ({ includePath, resolvedPath, rootRealDir }) => readConfigIncludeFileWithGuards({
			includePath,
			resolvedPath,
			rootRealDir,
			ioFs: deps.fs
		}),
		parseJson: (raw) => deps.json5.parse(raw)
	});
}
function resolveConfigForRead(resolvedIncludes, env) {
	if (resolvedIncludes && typeof resolvedIncludes === "object" && "env" in resolvedIncludes) applyConfigEnvVars(resolvedIncludes, env);
	const envWarnings = [];
	return {
		resolvedConfigRaw: resolveConfigEnvVars(resolvedIncludes, env, { onMissing: (w) => envWarnings.push(w) }),
		envSnapshotForRestore: { ...env },
		envWarnings
	};
}
function resolveLegacyConfigForRead(resolvedConfigRaw, sourceRaw) {
	const sourceLegacyIssues = findLegacyConfigIssues(resolvedConfigRaw, sourceRaw);
	if (sourceLegacyIssues.length === 0) return {
		effectiveConfigRaw: resolvedConfigRaw,
		sourceLegacyIssues
	};
	return {
		effectiveConfigRaw: migrateLegacyConfig(resolvedConfigRaw).config ?? resolvedConfigRaw,
		sourceLegacyIssues
	};
}
function createConfigFileSnapshot(params) {
	const sourceConfig = asResolvedSourceConfig(params.sourceConfig);
	const runtimeConfig = asRuntimeConfig(params.runtimeConfig);
	return {
		path: params.path,
		exists: params.exists,
		raw: params.raw,
		parsed: params.parsed,
		sourceConfig,
		resolved: sourceConfig,
		valid: params.valid,
		runtimeConfig,
		config: runtimeConfig,
		hash: params.hash,
		issues: params.issues,
		warnings: params.warnings,
		legacyIssues: params.legacyIssues
	};
}
async function finalizeReadConfigSnapshotInternalResult(deps, result) {
	await observeConfigSnapshot(deps, result.snapshot);
	return result;
}
function createConfigIO(overrides = {}) {
	const deps = normalizeDeps(overrides);
	const requestedConfigPath = resolveConfigPathForDeps(deps);
	const configPath = (deps.configPath ? [requestedConfigPath] : resolveDefaultConfigCandidates(deps.env, deps.homedir)).find((candidate) => deps.fs.existsSync(candidate)) ?? requestedConfigPath;
	function observeLoadConfigSnapshot(snapshot) {
		observeConfigSnapshotSync(deps, snapshot);
		return snapshot;
	}
	function loadConfig() {
		try {
			maybeLoadDotEnvForConfig(deps.env);
			if (!deps.fs.existsSync(configPath)) {
				if (shouldEnableShellEnvFallback(deps.env) && !shouldDeferShellEnvFallback(deps.env)) loadShellEnvFallback({
					enabled: true,
					env: deps.env,
					expectedKeys: SHELL_ENV_EXPECTED_KEYS,
					logger: deps.logger,
					timeoutMs: resolveShellEnvFallbackTimeoutMs(deps.env)
				});
				return {};
			}
			const raw = deps.fs.readFileSync(configPath, "utf-8");
			const recovered = maybeRecoverSuspiciousConfigReadSync({
				deps,
				configPath,
				raw,
				parsed: deps.json5.parse(raw)
			});
			const effectiveRaw = recovered.raw;
			const effectiveParsed = recovered.parsed;
			const hash = hashConfigRaw(effectiveRaw);
			const readResolution = resolveConfigForRead(resolveConfigIncludesForRead(effectiveParsed, configPath, deps), deps.env);
			const resolvedConfig = readResolution.resolvedConfigRaw;
			const legacyResolution = resolveLegacyConfigForRead(resolvedConfig, effectiveParsed);
			const effectiveConfigRaw = legacyResolution.effectiveConfigRaw;
			for (const w of readResolution.envWarnings) deps.logger.warn(`Config (${configPath}): missing env var "${w.varName}" at ${w.configPath} - feature using this value will be unavailable`);
			warnOnConfigMiskeys(effectiveConfigRaw, deps.logger);
			if (typeof effectiveConfigRaw !== "object" || effectiveConfigRaw === null) {
				observeLoadConfigSnapshot({ ...createConfigFileSnapshot({
					path: configPath,
					exists: true,
					raw: effectiveRaw,
					parsed: effectiveParsed,
					sourceConfig: {},
					valid: true,
					runtimeConfig: {},
					hash,
					issues: [],
					warnings: [],
					legacyIssues: legacyResolution.sourceLegacyIssues
				}) });
				return {};
			}
			const preValidationDuplicates = findDuplicateAgentDirs(effectiveConfigRaw, {
				env: deps.env,
				homedir: deps.homedir
			});
			if (preValidationDuplicates.length > 0) throw new DuplicateAgentDirError(preValidationDuplicates);
			const validated = validateConfigObjectWithPlugins(effectiveConfigRaw, { env: deps.env });
			if (!validated.ok) {
				observeLoadConfigSnapshot({ ...createConfigFileSnapshot({
					path: configPath,
					exists: true,
					raw: effectiveRaw,
					parsed: effectiveParsed,
					sourceConfig: coerceConfig(effectiveConfigRaw),
					valid: false,
					runtimeConfig: coerceConfig(effectiveConfigRaw),
					hash,
					issues: validated.issues,
					warnings: validated.warnings,
					legacyIssues: legacyResolution.sourceLegacyIssues
				}) });
				const details = validated.issues.map((iss) => `- ${sanitizeTerminalText(iss.path || "<root>")}: ${sanitizeTerminalText(iss.message)}`).join("\n");
				if (!loggedInvalidConfigs.has(configPath)) {
					loggedInvalidConfigs.add(configPath);
					deps.logger.error(`Invalid config at ${configPath}:\\n${details}`);
				}
				const error = /* @__PURE__ */ new Error(`Invalid config at ${configPath}:\n${details}`);
				error.code = "INVALID_CONFIG";
				error.details = details;
				throw error;
			}
			if (validated.warnings.length > 0) {
				const details = validated.warnings.map((iss) => `- ${sanitizeTerminalText(iss.path || "<root>")}: ${sanitizeTerminalText(iss.message)}`).join("\n");
				deps.logger.warn(`Config warnings:\\n${details}`);
			}
			warnIfConfigFromFuture(validated.config, deps.logger);
			const cfg = materializeRuntimeConfig(validated.config, "load");
			observeLoadConfigSnapshot({ ...createConfigFileSnapshot({
				path: configPath,
				exists: true,
				raw: effectiveRaw,
				parsed: effectiveParsed,
				sourceConfig: coerceConfig(effectiveConfigRaw),
				valid: true,
				runtimeConfig: cfg,
				hash,
				issues: [],
				warnings: validated.warnings,
				legacyIssues: legacyResolution.sourceLegacyIssues
			}) });
			const duplicates = findDuplicateAgentDirs(cfg, {
				env: deps.env,
				homedir: deps.homedir
			});
			if (duplicates.length > 0) throw new DuplicateAgentDirError(duplicates);
			applyConfigEnvVars(cfg, deps.env);
			if ((shouldEnableShellEnvFallback(deps.env) || cfg.env?.shellEnv?.enabled === true) && !shouldDeferShellEnvFallback(deps.env)) loadShellEnvFallback({
				enabled: true,
				env: deps.env,
				expectedKeys: SHELL_ENV_EXPECTED_KEYS,
				logger: deps.logger,
				timeoutMs: cfg.env?.shellEnv?.timeoutMs ?? resolveShellEnvFallbackTimeoutMs(deps.env)
			});
			const pendingSecret = AUTO_OWNER_DISPLAY_SECRET_BY_PATH.get(configPath);
			const ownerDisplaySecretResolution = ensureOwnerDisplaySecret(cfg, () => pendingSecret ?? crypto.randomBytes(32).toString("hex"));
			const cfgWithOwnerDisplaySecret = ownerDisplaySecretResolution.config;
			if (ownerDisplaySecretResolution.generatedSecret) {
				AUTO_OWNER_DISPLAY_SECRET_BY_PATH.set(configPath, ownerDisplaySecretResolution.generatedSecret);
				if (!AUTO_OWNER_DISPLAY_SECRET_PERSIST_IN_FLIGHT.has(configPath)) {
					AUTO_OWNER_DISPLAY_SECRET_PERSIST_IN_FLIGHT.add(configPath);
					writeConfigFile(cfgWithOwnerDisplaySecret, { expectedConfigPath: configPath }).then(() => {
						AUTO_OWNER_DISPLAY_SECRET_BY_PATH.delete(configPath);
						AUTO_OWNER_DISPLAY_SECRET_PERSIST_WARNED.delete(configPath);
					}).catch((err) => {
						if (!AUTO_OWNER_DISPLAY_SECRET_PERSIST_WARNED.has(configPath)) {
							AUTO_OWNER_DISPLAY_SECRET_PERSIST_WARNED.add(configPath);
							deps.logger.warn(`Failed to persist auto-generated commands.ownerDisplaySecret at ${configPath}: ${String(err)}`);
						}
					}).finally(() => {
						AUTO_OWNER_DISPLAY_SECRET_PERSIST_IN_FLIGHT.delete(configPath);
					});
				}
			} else {
				AUTO_OWNER_DISPLAY_SECRET_BY_PATH.delete(configPath);
				AUTO_OWNER_DISPLAY_SECRET_PERSIST_WARNED.delete(configPath);
			}
			return applyConfigOverrides(cfgWithOwnerDisplaySecret);
		} catch (err) {
			if (err instanceof DuplicateAgentDirError) {
				deps.logger.error(err.message);
				throw err;
			}
			if (err?.code === "INVALID_CONFIG") throw err;
			deps.logger.error(`Failed to read config at ${configPath}`, err);
			throw err;
		}
	}
	async function readConfigFileSnapshotInternal() {
		maybeLoadDotEnvForConfig(deps.env);
		if (!deps.fs.existsSync(configPath)) {
			const hash = hashConfigRaw(null);
			return await finalizeReadConfigSnapshotInternalResult(deps, { snapshot: createConfigFileSnapshot({
				path: configPath,
				exists: false,
				raw: null,
				parsed: {},
				sourceConfig: {},
				valid: true,
				runtimeConfig: materializeRuntimeConfig({}, "missing"),
				hash,
				issues: [],
				warnings: [],
				legacyIssues: []
			}) });
		}
		try {
			const raw = deps.fs.readFileSync(configPath, "utf-8");
			const rawHash = hashConfigRaw(raw);
			const parsedRes = parseConfigJson5(raw, deps.json5);
			if (!parsedRes.ok) return await finalizeReadConfigSnapshotInternalResult(deps, { snapshot: createConfigFileSnapshot({
				path: configPath,
				exists: true,
				raw,
				parsed: {},
				sourceConfig: {},
				valid: false,
				runtimeConfig: {},
				hash: rawHash,
				issues: [{
					path: "",
					message: `JSON5 parse failed: ${parsedRes.error}`
				}],
				warnings: [],
				legacyIssues: []
			}) });
			const recovered = await maybeRecoverSuspiciousConfigRead({
				deps,
				configPath,
				raw,
				parsed: parsedRes.parsed
			});
			const effectiveRaw = recovered.raw;
			const effectiveParsed = recovered.parsed;
			const hash = hashConfigRaw(effectiveRaw);
			let resolved;
			try {
				resolved = resolveConfigIncludesForRead(effectiveParsed, configPath, deps);
			} catch (err) {
				const message = err instanceof ConfigIncludeError ? err.message : `Include resolution failed: ${String(err)}`;
				return await finalizeReadConfigSnapshotInternalResult(deps, { snapshot: createConfigFileSnapshot({
					path: configPath,
					exists: true,
					raw: effectiveRaw,
					parsed: effectiveParsed,
					sourceConfig: coerceConfig(effectiveParsed),
					valid: false,
					runtimeConfig: coerceConfig(effectiveParsed),
					hash,
					issues: [{
						path: "",
						message
					}],
					warnings: [],
					legacyIssues: []
				}) });
			}
			const readResolution = resolveConfigForRead(resolved, deps.env);
			const envVarWarnings = readResolution.envWarnings.map((w) => ({
				path: w.configPath,
				message: `Missing env var "${w.varName}" - feature using this value will be unavailable`
			}));
			const resolvedConfigRaw = readResolution.resolvedConfigRaw;
			const legacyResolution = resolveLegacyConfigForRead(resolvedConfigRaw, effectiveParsed);
			const effectiveConfigRaw = legacyResolution.effectiveConfigRaw;
			const validated = validateConfigObjectWithPlugins(effectiveConfigRaw, { env: deps.env });
			if (!validated.ok) return await finalizeReadConfigSnapshotInternalResult(deps, { snapshot: createConfigFileSnapshot({
				path: configPath,
				exists: true,
				raw: effectiveRaw,
				parsed: effectiveParsed,
				sourceConfig: coerceConfig(effectiveConfigRaw),
				valid: false,
				runtimeConfig: coerceConfig(effectiveConfigRaw),
				hash,
				issues: validated.issues,
				warnings: [...validated.warnings, ...envVarWarnings],
				legacyIssues: legacyResolution.sourceLegacyIssues
			}) });
			warnIfConfigFromFuture(validated.config, deps.logger);
			const snapshotConfig = materializeRuntimeConfig(validated.config, "snapshot");
			return await finalizeReadConfigSnapshotInternalResult(deps, {
				snapshot: createConfigFileSnapshot({
					path: configPath,
					exists: true,
					raw: effectiveRaw,
					parsed: effectiveParsed,
					sourceConfig: coerceConfig(effectiveConfigRaw),
					valid: true,
					runtimeConfig: snapshotConfig,
					hash,
					issues: [],
					warnings: [...validated.warnings, ...envVarWarnings],
					legacyIssues: legacyResolution.sourceLegacyIssues
				}),
				envSnapshotForRestore: readResolution.envSnapshotForRestore
			});
		} catch (err) {
			const nodeErr = err;
			let message;
			if (nodeErr?.code === "EACCES") {
				const uid = process.getuid?.();
				const uidHint = typeof uid === "number" ? String(uid) : "$(id -u)";
				message = [
					`read failed: ${String(err)}`,
					``,
					`Config file is not readable by the current process. If running in a container`,
					`or 1-click deployment, fix ownership with:`,
					`  chown ${uidHint} "${configPath}"`,
					`Then restart the gateway.`
				].join("\n");
				deps.logger.error(message);
			} else message = `read failed: ${String(err)}`;
			return await finalizeReadConfigSnapshotInternalResult(deps, { snapshot: createConfigFileSnapshot({
				path: configPath,
				exists: true,
				raw: null,
				parsed: {},
				sourceConfig: {},
				valid: false,
				runtimeConfig: {},
				hash: hashConfigRaw(null),
				issues: [{
					path: "",
					message
				}],
				warnings: [],
				legacyIssues: []
			}) });
		}
	}
	async function readConfigFileSnapshot() {
		return (await readConfigFileSnapshotInternal()).snapshot;
	}
	async function readConfigFileSnapshotForWrite() {
		const result = await readConfigFileSnapshotInternal();
		return {
			snapshot: result.snapshot,
			writeOptions: {
				envSnapshotForRestore: result.envSnapshotForRestore,
				expectedConfigPath: configPath
			}
		};
	}
	async function writeConfigFile(cfg, options = {}) {
		let persistCandidate = cfg;
		const { snapshot } = await readConfigFileSnapshotInternal();
		let envRefMap = null;
		let changedPaths = null;
		if (snapshot.valid && snapshot.exists) {
			const patch = createMergePatch(snapshot.config, cfg);
			persistCandidate = applyMergePatch(snapshot.resolved, patch);
			try {
				const resolvedIncludes = resolveConfigIncludes(snapshot.parsed, configPath, {
					readFile: (candidate) => deps.fs.readFileSync(candidate, "utf-8"),
					readFileWithGuards: ({ includePath, resolvedPath, rootRealDir }) => readConfigIncludeFileWithGuards({
						includePath,
						resolvedPath,
						rootRealDir,
						ioFs: deps.fs
					}),
					parseJson: (raw) => deps.json5.parse(raw)
				});
				const collected = /* @__PURE__ */ new Map();
				collectEnvRefPaths(resolvedIncludes, "", collected);
				if (collected.size > 0) {
					envRefMap = collected;
					changedPaths = /* @__PURE__ */ new Set();
					collectChangedPaths(snapshot.config, cfg, "", changedPaths);
				}
			} catch {
				envRefMap = null;
			}
		}
		const validated = validateConfigObjectRawWithPlugins(persistCandidate, { env: deps.env });
		if (!validated.ok) {
			const issue = validated.issues[0];
			const pathLabel = issue?.path ? issue.path : "<root>";
			const issueMessage = issue?.message ?? "invalid";
			throw new Error(formatConfigValidationFailure(pathLabel, issueMessage));
		}
		if (validated.warnings.length > 0) {
			const details = validated.warnings.map((warning) => `- ${warning.path}: ${warning.message}`).join("\n");
			deps.logger.warn(`Config warnings:\n${details}`);
		}
		let cfgToWrite = persistCandidate;
		try {
			if (deps.fs.existsSync(configPath)) {
				const parsedRes = parseConfigJson5(await deps.fs.promises.readFile(configPath, "utf-8"), deps.json5);
				if (parsedRes.ok) {
					const envForRestore = options.envSnapshotForRestore ?? deps.env;
					cfgToWrite = restoreEnvVarRefs(cfgToWrite, parsedRes.parsed, envForRestore);
				}
			}
		} catch {}
		const dir = path.dirname(configPath);
		await deps.fs.promises.mkdir(dir, {
			recursive: true,
			mode: 448
		});
		await tightenStateDirPermissionsIfNeeded({
			configPath,
			env: deps.env,
			homedir: deps.homedir,
			fsModule: deps.fs
		});
		let outputConfig = envRefMap && changedPaths ? restoreEnvRefsFromMap(cfgToWrite, "", envRefMap, changedPaths) : cfgToWrite;
		if (options.unsetPaths?.length) for (const unsetPath of options.unsetPaths) {
			if (!Array.isArray(unsetPath) || unsetPath.length === 0) continue;
			const unsetResult = unsetPathForWrite(outputConfig, unsetPath);
			if (unsetResult.changed) outputConfig = unsetResult.next;
		}
		const stampedOutputConfig = stampConfigVersion(outputConfig);
		const json = JSON.stringify(stampedOutputConfig, null, 2).trimEnd().concat("\n");
		const nextHash = hashConfigRaw(json);
		const previousHash = resolveConfigSnapshotHash(snapshot);
		const changedPathCount = changedPaths?.size;
		const previousBytes = typeof snapshot.raw === "string" ? Buffer.byteLength(snapshot.raw, "utf-8") : null;
		const nextBytes = Buffer.byteLength(json, "utf-8");
		const previousStat = snapshot.exists ? await deps.fs.promises.stat(configPath).catch(() => null) : null;
		const hasMetaBefore = hasConfigMeta(snapshot.parsed);
		const hasMetaAfter = hasConfigMeta(stampedOutputConfig);
		const gatewayModeBefore = resolveGatewayMode(snapshot.resolved);
		const gatewayModeAfter = resolveGatewayMode(stampedOutputConfig);
		const suspiciousReasons = resolveConfigWriteSuspiciousReasons({
			existsBefore: snapshot.exists,
			previousBytes,
			nextBytes,
			hasMetaBefore,
			gatewayModeBefore,
			gatewayModeAfter
		});
		const logConfigOverwrite = () => {
			if (!snapshot.exists) return;
			const isVitest = deps.env.VITEST === "true";
			const shouldLogInVitest = deps.env.OPENCLAW_TEST_CONFIG_OVERWRITE_LOG === "1";
			if (isVitest && !shouldLogInVitest) return;
			const changeSummary = typeof changedPathCount === "number" ? `, changedPaths=${changedPathCount}` : "";
			deps.logger.warn(`Config overwrite: ${configPath} (sha256 ${previousHash ?? "unknown"} -> ${nextHash}, backup=${configPath}.bak${changeSummary})`);
		};
		const logConfigWriteAnomalies = () => {
			if (suspiciousReasons.length === 0) return;
			const isVitest = deps.env.VITEST === "true";
			const shouldLogInVitest = deps.env.OPENCLAW_TEST_CONFIG_WRITE_ANOMALY_LOG === "1";
			if (isVitest && !shouldLogInVitest) return;
			deps.logger.warn(`Config write anomaly: ${configPath} (${suspiciousReasons.join(", ")})`);
		};
		const auditRecordBase = {
			ts: (/* @__PURE__ */ new Date()).toISOString(),
			source: "config-io",
			event: "config.write",
			configPath,
			pid: process.pid,
			ppid: process.ppid,
			cwd: process.cwd(),
			argv: process.argv.slice(0, 8),
			execArgv: process.execArgv.slice(0, 8),
			watchMode: deps.env.OPENCLAW_WATCH_MODE === "1",
			watchSession: typeof deps.env.OPENCLAW_WATCH_SESSION === "string" && deps.env.OPENCLAW_WATCH_SESSION.trim().length > 0 ? deps.env.OPENCLAW_WATCH_SESSION.trim() : null,
			watchCommand: typeof deps.env.OPENCLAW_WATCH_COMMAND === "string" && deps.env.OPENCLAW_WATCH_COMMAND.trim().length > 0 ? deps.env.OPENCLAW_WATCH_COMMAND.trim() : null,
			existsBefore: snapshot.exists,
			previousHash: previousHash ?? null,
			nextHash,
			previousBytes,
			nextBytes,
			previousDev: resolveConfigStatMetadata(previousStat).dev,
			nextDev: null,
			previousIno: resolveConfigStatMetadata(previousStat).ino,
			nextIno: null,
			previousMode: resolveConfigStatMetadata(previousStat).mode,
			nextMode: null,
			previousNlink: resolveConfigStatMetadata(previousStat).nlink,
			nextNlink: null,
			previousUid: resolveConfigStatMetadata(previousStat).uid,
			nextUid: null,
			previousGid: resolveConfigStatMetadata(previousStat).gid,
			nextGid: null,
			changedPathCount: typeof changedPathCount === "number" ? changedPathCount : null,
			hasMetaBefore,
			hasMetaAfter,
			gatewayModeBefore,
			gatewayModeAfter,
			suspicious: suspiciousReasons
		};
		const appendWriteAudit = async (result, err, nextStat) => {
			const errorCode = err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : void 0;
			const errorMessage = err && typeof err === "object" && "message" in err && typeof err.message === "string" ? err.message : void 0;
			const nextMetadata = resolveConfigStatMetadata(nextStat ?? null);
			await appendConfigAuditRecord(deps, {
				...auditRecordBase,
				result,
				nextHash: result === "failed" ? null : auditRecordBase.nextHash,
				nextBytes: result === "failed" ? null : auditRecordBase.nextBytes,
				nextDev: result === "failed" ? null : nextMetadata.dev,
				nextIno: result === "failed" ? null : nextMetadata.ino,
				nextMode: result === "failed" ? null : nextMetadata.mode,
				nextNlink: result === "failed" ? null : nextMetadata.nlink,
				nextUid: result === "failed" ? null : nextMetadata.uid,
				nextGid: result === "failed" ? null : nextMetadata.gid,
				errorCode,
				errorMessage
			});
		};
		const tmp = path.join(dir, `${path.basename(configPath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
		try {
			await deps.fs.promises.writeFile(tmp, json, {
				encoding: "utf-8",
				mode: 384
			});
			if (deps.fs.existsSync(configPath)) await maintainConfigBackups(configPath, deps.fs.promises, {
				ioFs: deps.fs.promises,
				validateBeforeBackup: (rawContent) => {
					try {
						const parsed = parseConfigJson5(rawContent, deps.json5);
						if (!parsed.ok) return false;
						return validateConfigObjectRawWithPlugins(parsed.parsed, { env: deps.env }).ok;
					} catch {
						return false;
					}
				},
				log: deps.logger
			});
			try {
				await deps.fs.promises.rename(tmp, configPath);
			} catch (err) {
				const code = err.code;
				if (code === "EPERM" || code === "EEXIST") {
					await deps.fs.promises.copyFile(tmp, configPath);
					await deps.fs.promises.chmod(configPath, 384).catch(() => {});
					await deps.fs.promises.unlink(tmp).catch(() => {});
					logConfigOverwrite();
					logConfigWriteAnomalies();
					await appendWriteAudit("copy-fallback", void 0, await deps.fs.promises.stat(configPath).catch(() => null));
					return { persistedHash: nextHash };
				}
				await deps.fs.promises.unlink(tmp).catch(() => {});
				throw err;
			}
			logConfigOverwrite();
			logConfigWriteAnomalies();
			await appendWriteAudit("rename", void 0, await deps.fs.promises.stat(configPath).catch(() => null));
			return { persistedHash: nextHash };
		} catch (err) {
			await appendWriteAudit("failed", err);
			throw err;
		}
	}
	return {
		configPath,
		loadConfig,
		readConfigFileSnapshot,
		readConfigFileSnapshotForWrite,
		writeConfigFile
	};
}
const AUTO_OWNER_DISPLAY_SECRET_BY_PATH = /* @__PURE__ */ new Map();
const AUTO_OWNER_DISPLAY_SECRET_PERSIST_IN_FLIGHT = /* @__PURE__ */ new Set();
const AUTO_OWNER_DISPLAY_SECRET_PERSIST_WARNED = /* @__PURE__ */ new Set();
let runtimeConfigSnapshot = null;
let runtimeConfigSourceSnapshot = null;
let runtimeConfigSnapshotRefreshHandler = null;
const configWriteListeners = /* @__PURE__ */ new Set();
function notifyConfigWriteListeners(event) {
	for (const listener of configWriteListeners) try {
		listener(event);
	} catch {}
}
function clearConfigCache() {}
function registerConfigWriteListener(listener) {
	configWriteListeners.add(listener);
	return () => {
		configWriteListeners.delete(listener);
	};
}
function setRuntimeConfigSnapshot(config, sourceConfig) {
	runtimeConfigSnapshot = config;
	runtimeConfigSourceSnapshot = sourceConfig ?? null;
}
function resetConfigRuntimeState() {
	runtimeConfigSnapshot = null;
	runtimeConfigSourceSnapshot = null;
}
function clearRuntimeConfigSnapshot() {
	resetConfigRuntimeState();
}
function getRuntimeConfigSnapshot() {
	return runtimeConfigSnapshot;
}
function getRuntimeConfigSourceSnapshot() {
	return runtimeConfigSourceSnapshot;
}
function isCompatibleTopLevelRuntimeProjectionShape(params) {
	const runtime = params.runtimeSnapshot;
	const candidate = params.candidate;
	for (const key of Object.keys(runtime)) {
		if (!Object.hasOwn(candidate, key)) return false;
		const runtimeValue = runtime[key];
		const candidateValue = candidate[key];
		if ((Array.isArray(runtimeValue) ? "array" : runtimeValue === null ? "null" : typeof runtimeValue) !== (Array.isArray(candidateValue) ? "array" : candidateValue === null ? "null" : typeof candidateValue)) return false;
	}
	return true;
}
function projectConfigOntoRuntimeSourceSnapshot(config) {
	if (!runtimeConfigSnapshot || !runtimeConfigSourceSnapshot) return config;
	if (config === runtimeConfigSnapshot) return runtimeConfigSourceSnapshot;
	if (!isCompatibleTopLevelRuntimeProjectionShape({
		runtimeSnapshot: runtimeConfigSnapshot,
		candidate: config
	})) return config;
	const runtimePatch = createMergePatch(runtimeConfigSnapshot, config);
	return coerceConfig(applyMergePatch(runtimeConfigSourceSnapshot, runtimePatch));
}
function setRuntimeConfigSnapshotRefreshHandler(refreshHandler) {
	runtimeConfigSnapshotRefreshHandler = refreshHandler;
}
function loadConfig() {
	if (runtimeConfigSnapshot) return runtimeConfigSnapshot;
	const config = createConfigIO().loadConfig();
	setRuntimeConfigSnapshot(config);
	return runtimeConfigSnapshot ?? config;
}
function getRuntimeConfig() {
	return loadConfig();
}
async function readBestEffortConfig() {
	const snapshot = await readConfigFileSnapshot();
	return snapshot.valid ? loadConfig() : snapshot.config;
}
async function readConfigFileSnapshot() {
	return await createConfigIO().readConfigFileSnapshot();
}
async function readSourceConfigSnapshot() {
	return await readConfigFileSnapshot();
}
async function readConfigFileSnapshotForWrite() {
	return await createConfigIO().readConfigFileSnapshotForWrite();
}
async function readSourceConfigSnapshotForWrite() {
	return await readConfigFileSnapshotForWrite();
}
async function writeConfigFile(cfg, options = {}) {
	const io = createConfigIO();
	let nextCfg = cfg;
	const hadRuntimeSnapshot = Boolean(runtimeConfigSnapshot);
	const hadBothSnapshots = Boolean(runtimeConfigSnapshot && runtimeConfigSourceSnapshot);
	if (hadBothSnapshots) {
		const runtimePatch = createMergePatch(runtimeConfigSnapshot, cfg);
		nextCfg = coerceConfig(applyMergePatch(runtimeConfigSourceSnapshot, runtimePatch));
	}
	const sameConfigPath = options.expectedConfigPath === void 0 || options.expectedConfigPath === io.configPath;
	const writeResult = await io.writeConfigFile(nextCfg, {
		envSnapshotForRestore: sameConfigPath ? options.envSnapshotForRestore : void 0,
		unsetPaths: options.unsetPaths
	});
	const notifyCommittedWrite = () => {
		if (!runtimeConfigSnapshot) return;
		notifyConfigWriteListeners({
			configPath: io.configPath,
			sourceConfig: nextCfg,
			runtimeConfig: runtimeConfigSnapshot,
			persistedHash: writeResult.persistedHash,
			writtenAtMs: Date.now()
		});
	};
	const refreshHandler = runtimeConfigSnapshotRefreshHandler;
	if (refreshHandler) try {
		if (await refreshHandler.refresh({ sourceConfig: nextCfg })) {
			notifyCommittedWrite();
			return;
		}
	} catch (error) {
		try {
			refreshHandler.clearOnRefreshFailure?.();
		} catch {}
		const detail = error instanceof Error ? error.message : String(error);
		throw new ConfigRuntimeRefreshError(`Config was written to ${io.configPath}, but runtime snapshot refresh failed: ${detail}`, { cause: error });
	}
	if (hadBothSnapshots) {
		setRuntimeConfigSnapshot(io.loadConfig(), nextCfg);
		notifyCommittedWrite();
		return;
	}
	if (hadRuntimeSnapshot) {
		setRuntimeConfigSnapshot(io.loadConfig());
		notifyCommittedWrite();
		return;
	}
	setRuntimeConfigSnapshot(io.loadConfig());
	notifyCommittedWrite();
}
//#endregion
export { setConfigValueAtPath as A, applyConfigOverrides as C, unsetConfigOverride as D, setConfigOverride as E, resolveOwnerDisplaySetting as F, migrateLegacyConfig as M, collectDurableServiceEnvVars as N, getConfigValueAtPath as O, createConfigRuntimeEnv as P, normalizeOpenClawVersionBase as S, resetConfigOverrides as T, resetConfigRuntimeState as _, getRuntimeConfig as a, setRuntimeConfigSnapshotRefreshHandler as b, loadConfig as c, readBestEffortConfig as d, readConfigFileSnapshot as f, registerConfigWriteListener as g, readSourceConfigSnapshotForWrite as h, createConfigIO as i, unsetConfigValueAtPath as j, parseConfigPath as k, parseConfigJson5 as l, readSourceConfigSnapshot as m, clearConfigCache as n, getRuntimeConfigSnapshot as o, readConfigFileSnapshotForWrite as p, clearRuntimeConfigSnapshot as r, getRuntimeConfigSourceSnapshot as s, ConfigRuntimeRefreshError as t, projectConfigOntoRuntimeSourceSnapshot as u, resolveConfigSnapshotHash as v, getConfigOverrides as w, writeConfigFile as x, setRuntimeConfigSnapshot as y };
