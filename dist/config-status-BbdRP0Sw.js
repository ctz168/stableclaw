import { _ as resolveStateDir } from "./paths-GWMNxnBn.js";
import fsSync from "node:fs";
import path from "node:path";
//#region src/config/config-status.ts
const CONFIG_STATUS_FILENAME = "config-status.json";
/**
* Resolve the path to the config status file.
* Location: ~/.openclaw/state/config-status.json
*/
function resolveConfigStatusPath(env = process.env) {
	const stateDir = resolveStateDir(env);
	return path.join(stateDir, CONFIG_STATUS_FILENAME);
}
/**
* Read the current configuration status.
* Returns a default valid status if no status file exists.
*/
function getConfigStatus(env = process.env) {
	const statusPath = resolveConfigStatusPath(env);
	try {
		if (!fsSync.existsSync(statusPath)) return createDefaultConfigStatus();
		const raw = fsSync.readFileSync(statusPath, "utf-8");
		const status = JSON.parse(raw);
		if (!status.status || !status.timestamp) return createDefaultConfigStatus();
		return status;
	} catch (err) {
		return createDefaultConfigStatus();
	}
}
/**
* Write the configuration status to disk.
*/
function setConfigStatus(status, env = process.env) {
	const statusPath = resolveConfigStatusPath(env);
	const stateDir = path.dirname(statusPath);
	if (!fsSync.existsSync(stateDir)) fsSync.mkdirSync(stateDir, { recursive: true });
	const tempPath = `${statusPath}.tmp`;
	fsSync.writeFileSync(tempPath, JSON.stringify(status, null, 2), "utf-8");
	fsSync.renameSync(tempPath, statusPath);
}
/**
* Mark configuration as valid.
*/
function markConfigValid(options = {}, env = process.env) {
	const current = getConfigStatus(env);
	setConfigStatus({
		status: "valid",
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		lastValidHash: options.hash ?? current.lastValidHash,
		lastValidBackupPath: options.backupPath ?? current.lastValidBackupPath
	}, env);
}
/**
* Mark configuration as invalid.
*/
function markConfigInvalid(error, env = process.env) {
	const current = getConfigStatus(env);
	setConfigStatus({
		status: "invalid",
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		lastValidHash: current.lastValidHash,
		lastValidBackupPath: current.lastValidBackupPath,
		error: {
			message: error.message,
			issues: error.issues,
			configPath: error.configPath,
			invalidConfigPath: error.invalidConfigPath
		}
	}, env);
}
/**
* Mark configuration as rolling back.
*/
function markConfigRollingBack(reason, env = process.env) {
	const current = getConfigStatus(env);
	setConfigStatus({
		status: "rolling_back",
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		lastValidHash: current.lastValidHash,
		lastValidBackupPath: current.lastValidBackupPath,
		rollback: {
			startedAt: (/* @__PURE__ */ new Date()).toISOString(),
			reason
		}
	}, env);
}
/**
* Create a default valid configuration status.
*/
function createDefaultConfigStatus() {
	return {
		status: "valid",
		timestamp: (/* @__PURE__ */ new Date()).toISOString()
	};
}
/**
* Check if the last configuration was invalid (for startup warnings).
*/
function wasLastConfigInvalid(env = process.env) {
	return getConfigStatus(env).status === "invalid";
}
/**
* Clear the configuration error status (reset to valid).
*/
function clearConfigStatus(env = process.env) {
	setConfigStatus(createDefaultConfigStatus(), env);
}
//#endregion
export { markConfigValid as a, wasLastConfigInvalid as c, markConfigRollingBack as i, getConfigStatus as n, resolveConfigStatusPath as o, markConfigInvalid as r, setConfigStatus as s, clearConfigStatus as t };
