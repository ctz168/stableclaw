import { t as createSubsystemLogger } from "./subsystem-C9VSlEcV.js";
import { t as CONFIG_PATH } from "./paths-GWMNxnBn.js";
import { r as validateConfigObjectRaw } from "./validation-IqV6B-0y.js";
import { a as markConfigValid, i as markConfigRollingBack, r as markConfigInvalid } from "./config-status-BbdRP0Sw.js";
import fsSync from "node:fs";
//#region src/gateway/config-error-handler.ts
/**
* Configuration error handler for hot reload safety.
* 
* This module provides:
* - Detailed error reporting when configuration is invalid
* - Automatic rollback to the last valid configuration
* - Preservation of invalid configs for user inspection
*/
const configLog = createSubsystemLogger("config");
/**
* Handle an invalid configuration snapshot.
* 
* This function:
* 1. Logs a detailed error message
* 2. Preserves the invalid config for user inspection
* 3. Attempts to rollback to the last valid config
* 4. Updates the configuration status
*/
async function handleInvalidConfig(snapshot, options = {}) {
	const configPath = options.configPath ?? snapshot.path ?? CONFIG_PATH;
	const env = options.env ?? process.env;
	const errorMessage = formatDetailedError(snapshot);
	const shortMessage = formatShortError(snapshot);
	configLog.error(`Configuration validation failed:\n${errorMessage}`);
	let invalidConfigPath;
	try {
		invalidConfigPath = await preserveInvalidConfig(snapshot, {
			configPath,
			env
		});
		if (invalidConfigPath) configLog.info(`Invalid config preserved at: ${invalidConfigPath}`);
	} catch (err) {
		configLog.warn(`Failed to preserve invalid config: ${String(err)}`);
	}
	markConfigInvalid({
		message: shortMessage,
		issues: snapshot.issues,
		configPath,
		invalidConfigPath
	}, env);
	if ((await rollbackToValidConfig({
		configPath,
		env
	})).success) {
		configLog.info(`Configuration rolled back to last valid version`);
		return {
			handled: true,
			rolledBack: true,
			invalidConfigPath,
			errorMessage
		};
	}
	configLog.warn(`No valid backup available for rollback. Gateway will continue with last known-good configuration in memory.`);
	return {
		handled: true,
		rolledBack: false,
		invalidConfigPath,
		errorMessage
	};
}
/**
* Format a detailed error message with all issues.
*/
function formatDetailedError(snapshot) {
	const lines = [];
	lines.push("━".repeat(60));
	lines.push("CONFIGURATION VALIDATION FAILED");
	lines.push("━".repeat(60));
	lines.push("");
	if (snapshot.issues.length === 0) lines.push("No specific validation issues reported.");
	else {
		lines.push("Issues found:");
		lines.push("");
		for (const issue of snapshot.issues) {
			const pathLabel = issue.path || "<root>";
			const message = issue.message;
			lines.push(`  ❌ ${pathLabel}`);
			lines.push(`     ${message}`);
			if (issue.suggestion) lines.push(`     💡 ${issue.suggestion}`);
			lines.push("");
		}
	}
	lines.push("━".repeat(60));
	lines.push("The invalid configuration has been preserved for inspection.");
	lines.push("The gateway will continue using the last valid configuration.");
	lines.push("━".repeat(60));
	return lines.join("\n");
}
/**
* Format a short error message for status tracking.
*/
function formatShortError(snapshot) {
	if (snapshot.issues.length === 0) return "Configuration validation failed";
	const issueCount = snapshot.issues.length;
	const firstIssue = snapshot.issues[0];
	const pathLabel = firstIssue.path || "<root>";
	return `Configuration validation failed (${issueCount} issue${issueCount > 1 ? "s" : ""}): ${pathLabel} - ${firstIssue.message}`;
}
/**
* Preserve the invalid configuration for user inspection.
* Creates a timestamped copy of the invalid config.
*/
async function preserveInvalidConfig(snapshot, options) {
	if (!snapshot.raw) return;
	const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
	const invalidPath = `${options.configPath}.error-${timestamp}`;
	try {
		await fsSync.promises.writeFile(invalidPath, snapshot.raw, "utf-8");
		try {
			await fsSync.promises.chmod(invalidPath, 384);
		} catch {}
		return invalidPath;
	} catch (err) {
		configLog.warn(`Failed to preserve invalid config: ${String(err)}`);
		return;
	}
}
/**
* Rollback to the last valid configuration.
* 
* This function:
* 1. Finds the most recent valid backup
* 2. Marks the status as "rolling_back"
* 3. Restores the valid config
* 4. Updates the status to "valid"
*/
async function rollbackToValidConfig(options) {
	const configPath = options.configPath;
	const env = options.env;
	const backupPath = await findLatestValidBackup(configPath);
	if (!backupPath) return { success: false };
	markConfigRollingBack("Invalid configuration detected, rolling back to last valid backup", env);
	try {
		const backupContent = await fsSync.promises.readFile(backupPath, "utf-8");
		const tempPath = `${configPath}.rollback-tmp`;
		await fsSync.promises.writeFile(tempPath, backupContent, "utf-8");
		await fsSync.promises.rename(tempPath, configPath);
		markConfigValid({ backupPath }, env);
		return {
			success: true,
			backupPath
		};
	} catch (err) {
		configLog.error(`Rollback failed: ${String(err)}`);
		return { success: false };
	}
}
/**
* Find the most recent valid backup file.
* Checks openclaw.json.bak, openclaw.json.bak.1, etc.
*
* **ROOT-CAUSE FIX**: Only JSON.parse is NOT enough — a backup file could contain
* structurally valid JSON that still fails the OpenClaw Zod schema (e.g. missing
* required fields, wrong types). Such a backup must NOT be used for rollback because
* restoring it would just replace one broken config with another.
*
* We now run `validateConfigObjectRaw()` (lightweight, no plugin loading) on each
* candidate. Only backups that pass full schema validation are considered.
*/
async function findLatestValidBackup(configPath) {
	const candidates = [
		`${configPath}.bak`,
		`${configPath}.bak.1`,
		`${configPath}.bak.2`,
		`${configPath}.bak.3`,
		`${configPath}.bak.4`
	];
	for (const candidate of candidates) try {
		if (fsSync.existsSync(candidate)) {
			const content = await fsSync.promises.readFile(candidate, "utf-8");
			const result = validateConfigObjectRaw(JSON.parse(content));
			if (!result.ok) {
				configLog.warn(`backup ${candidate} rejected for rollback: schema validation failed (${result.issues.map((i) => i.message).join(", ")})`);
				continue;
			}
			return candidate;
		}
	} catch {
		continue;
	}
}
/**
* Clear configuration error status and mark as valid.
* Called when a new valid configuration is successfully applied.
*/
function clearConfigError(env = process.env) {
	markConfigValid({}, env);
	configLog.info("Configuration status cleared (valid)");
}
//#endregion
export { handleInvalidConfig as n, clearConfigError as t };
