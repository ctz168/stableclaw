import { n as defaultRuntime } from "./runtime-kS8e4c6-.js";
import { r as theme } from "./theme-wBMZmJzz.js";
import fsSync from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
//#region src/migration/from-openclaw.ts
const execAsync = promisify(exec);
const OPENCLAW_DIR = ".openclaw";
const STABLECLAW_DIR = ".stableclaw";
/**
* Detect running OpenClaw process
*/
async function detectRunningOpenClaw() {
	try {
		if (os.platform() === "win32") {
			const { stdout } = await execAsync("tasklist /FI \"IMAGENAME eq node.exe\" /FO CSV /V");
			const lines = stdout.split("\n").slice(1);
			for (const line of lines) if (line.includes("openclaw") || line.includes("stableclaw")) {
				const match = line.match(/"node\.exe","(\d+)"/);
				if (match) {
					const pid = parseInt(match[1]);
					try {
						const { stdout: cmdline } = await execAsync(`wmic process where ProcessId=${pid} get CommandLine /format:list`);
						const cmdMatch = cmdline.match(/CommandLine=(.+)/);
						if (cmdMatch) {
							const cmdLine = cmdMatch[1].trim();
							const configDirMatch = cmdLine.match(/--config-dir[= ]([^\s]+)/);
							const homeDir = path.join(os.homedir(), OPENCLAW_DIR);
							return {
								isRunning: true,
								pid,
								configDir: configDirMatch ? configDirMatch[1] : homeDir,
								commandLine: cmdLine
							};
						}
					} catch {
						return {
							isRunning: true,
							pid,
							configDir: path.join(os.homedir(), OPENCLAW_DIR)
						};
					}
				}
			}
		} else {
			const { stdout } = await execAsync("ps aux | grep -E \"openclaw|stableclaw\" | grep -v grep");
			const lines = stdout.split("\n").filter((l) => l.trim());
			for (const line of lines) {
				const parts = line.split(/\s+/);
				const pid = parseInt(parts[1]);
				const cmdLine = parts.slice(10).join(" ");
				const configDirMatch = cmdLine.match(/--config-dir[= ]([^\s]+)/);
				const homeDir = path.join(os.homedir(), OPENCLAW_DIR);
				return {
					isRunning: true,
					pid,
					configDir: configDirMatch ? configDirMatch[1] : homeDir,
					commandLine: cmdLine
				};
			}
		}
		return { isRunning: false };
	} catch (error) {
		return { isRunning: false };
	}
}
/**
* Auto-detect OpenClaw configuration directory
*/
async function autoDetectOpenClawDir() {
	const envDir = process.env.OPENCLAW_CONFIG_DIR;
	if (envDir && fsSync.existsSync(envDir)) return envDir;
	const detection = await detectRunningOpenClaw();
	if (detection.isRunning && detection.configDir && fsSync.existsSync(detection.configDir)) return detection.configDir;
	const defaultDir = path.join(os.homedir(), OPENCLAW_DIR);
	if (fsSync.existsSync(defaultDir)) return defaultDir;
	const altDirs = [
		path.join(os.homedir(), ".config", "openclaw"),
		path.join(os.homedir(), "AppData", "Roaming", "openclaw"),
		path.join(os.homedir(), "Library", "Application Support", "openclaw")
	];
	for (const dir of altDirs) if (fsSync.existsSync(dir)) return dir;
	return null;
}
function getStableClawDir() {
	return path.join(os.homedir(), STABLECLAW_DIR);
}
function checkStableClawExists() {
	const stableclawDir = getStableClawDir();
	return fsSync.existsSync(stableclawDir);
}
async function copyFileWithBackup(source, target, options) {
	try {
		if (!fsSync.existsSync(source)) return {
			ok: false,
			error: `Source file not found: ${source}`
		};
		if (fsSync.existsSync(target)) await fsSync.promises.unlink(target);
		const targetDir = path.dirname(target);
		await fsSync.promises.mkdir(targetDir, { recursive: true });
		await fsSync.promises.copyFile(source, target);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
async function copyDirectoryWithBackup(source, target, options) {
	try {
		if (!fsSync.existsSync(source)) return {
			ok: false,
			error: `Source directory not found: ${source}`
		};
		if (fsSync.existsSync(target)) await fsSync.promises.rm(target, {
			recursive: true,
			force: true
		});
		await fsSync.promises.mkdir(target, { recursive: true });
		const entries = await fsSync.promises.readdir(source, { withFileTypes: true });
		const skipped = [];
		for (const entry of entries) {
			const sourcePath = path.join(source, entry.name);
			const targetPath = path.join(target, entry.name);
			if (entry.isDirectory()) {
				if (!(await copyDirectoryWithBackup(sourcePath, targetPath, options)).ok) skipped.push(entry.name);
			} else if (entry.isFile()) {
				if (!(await copyFileWithBackup(sourcePath, targetPath, options)).ok) skipped.push(entry.name);
			}
		}
		return {
			ok: true,
			skipped
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
async function migrateFromOpenClaw(options) {
	const result = {
		ok: false,
		status: "not_started",
		migratedItems: [],
		warnings: [],
		errors: []
	};
	console.log("\n🔍 Step 1: Detecting OpenClaw installation...\n");
	let openclawDir = options.openclawDir || null;
	const detection = await detectRunningOpenClaw();
	if (detection.isRunning) {
		console.log(`✓ OpenClaw is running (PID: ${detection.pid})`);
		if (detection.configDir) {
			console.log(`✓ Found config directory: ${detection.configDir}`);
			openclawDir = detection.configDir;
		}
	} else console.log("ℹ OpenClaw is not running");
	if (!openclawDir) {
		console.log("\n🔍 Searching for OpenClaw configuration directory...");
		openclawDir = await autoDetectOpenClawDir();
		if (openclawDir) console.log(`✓ Found OpenClaw directory: ${openclawDir}`);
		else {
			console.log("✗ OpenClaw configuration directory not found");
			console.log("\n💡 Suggestion: Please start OpenClaw first, or manually specify:");
			console.log("   stableclaw migrate from-openclaw --openclaw-dir <path>");
			result.status = "failed";
			result.errors.push("OpenClaw configuration directory not found.");
			result.errors.push("Please start OpenClaw first or use --openclaw-dir option.");
			return result;
		}
	}
	if (!fsSync.existsSync(openclawDir)) {
		result.status = "failed";
		result.errors.push(`OpenClaw directory does not exist: ${openclawDir}`);
		return result;
	}
	const detectedOpenClawDir = openclawDir;
	console.log("\n🔍 Step 2: Checking StableClaw status...\n");
	const stableclawDir = getStableClawDir();
	const stableclawExists = checkStableClawExists();
	console.log(`StableClaw directory: ${stableclawDir}`);
	console.log(`StableClaw exists: ${stableclawExists ? "✓ Yes" : "✗ No"}`);
	if (stableclawExists && !options.force) {
		result.status = "failed";
		result.errors.push("StableClaw already exists. Use --force to overwrite or merge.");
		result.warnings.push("Existing StableClaw installation detected.");
		console.log("\n⚠️  StableClaw already exists. Use --force to overwrite.");
		return result;
	}
	result.status = "in_progress";
	console.log("\n📦 Step 3: Starting migration...\n");
	if (checkStableClawExists() && !options.force) {
		result.status = "failed";
		result.errors.push("StableClaw already exists. Use --force to overwrite or merge.");
		result.warnings.push("Existing StableClaw installation detected.");
		return result;
	}
	result.status = "in_progress";
	if (!options.dryRun) await fsSync.promises.mkdir(getStableClawDir(), { recursive: true });
	console.log("Migrating configuration...");
	const openclawConfig = path.join(detectedOpenClawDir, "openclaw.json");
	const stableclawConfig = path.join(stableclawDir, "stableclaw.json");
	if (!fsSync.existsSync(openclawConfig)) {
		result.errors.push("OpenClaw config file not found");
		console.error("✗ OpenClaw config file not found");
	} else if (options.dryRun) console.log(`[DRY RUN] Would copy: ${openclawConfig} → ${stableclawConfig}`);
	else {
		const configResult = await copyFileWithBackup(openclawConfig, stableclawConfig, options);
		if (configResult.ok) {
			result.migratedItems.push("config");
			console.log("✓ Configuration migrated successfully");
		} else {
			result.errors.push(`Config migration failed: ${configResult.error}`);
			console.error(`✗ Configuration migration failed: ${configResult.error}`);
		}
	}
	console.log("Migrating plugins...");
	if (!options.skipPlugins) {
		const openclawPlugins = path.join(detectedOpenClawDir, "extensions");
		const stableclawPlugins = path.join(stableclawDir, "extensions");
		if (fsSync.existsSync(openclawPlugins)) if (options.dryRun) {
			const pluginCount = (await fsSync.promises.readdir(openclawPlugins, { withFileTypes: true })).filter((e) => e.isDirectory()).length;
			console.log(`[DRY RUN] Would copy ${pluginCount} plugins: ${openclawPlugins} → ${stableclawPlugins}`);
			result.migratedItems.push(`plugins (${pluginCount})`);
		} else {
			const pluginsResult = await copyDirectoryWithBackup(openclawPlugins, stableclawPlugins, options);
			if (pluginsResult.ok) {
				const pluginCount = (await fsSync.promises.readdir(stableclawPlugins, { withFileTypes: true })).filter((e) => e.isDirectory()).length;
				result.migratedItems.push(`plugins (${pluginCount})`);
				console.log(`✓ Migrated ${pluginCount} plugins`);
			} else {
				result.errors.push(`Plugins migration failed: ${pluginsResult.error}`);
				console.error(`✗ Plugins migration failed: ${pluginsResult.error}`);
			}
		}
		else {
			result.warnings.push("No plugins found to migrate");
			console.log("  No plugins found to migrate");
		}
	} else console.log("  Skipping plugins migration");
	console.log("Migrating credentials...");
	if (!options.skipCredentials) {
		const openclawCreds = path.join(detectedOpenClawDir, "credentials");
		const stableclawCreds = path.join(stableclawDir, "credentials");
		if (fsSync.existsSync(openclawCreds)) if (options.dryRun) {
			const entries = await fsSync.promises.readdir(openclawCreds);
			console.log(`[DRY RUN] Would copy ${entries.length} credential files: ${openclawCreds} → ${stableclawCreds}`);
			result.migratedItems.push(`credentials (${entries.length})`);
		} else {
			const credsResult = await copyDirectoryWithBackup(openclawCreds, stableclawCreds, options);
			if (credsResult.ok) {
				const entries = await fsSync.promises.readdir(stableclawCreds);
				result.migratedItems.push(`credentials (${entries.length})`);
				console.log(`✓ Migrated ${entries.length} credential files`);
			} else {
				result.errors.push(`Credentials migration failed: ${credsResult.error}`);
				console.error(`✗ Credentials migration failed: ${credsResult.error}`);
			}
		}
		else {
			result.warnings.push("No credentials found to migrate");
			console.log("  No credentials found to migrate");
		}
	} else console.log("  Skipping credentials migration");
	const dataDirs = [
		{
			name: "logs",
			skip: options.skipLogs
		},
		{
			name: "memory",
			skip: options.skipMemory
		},
		{
			name: "tasks",
			skip: options.skipTasks
		},
		{
			name: "devices",
			skip: false
		},
		{
			name: "agents",
			skip: false
		},
		{
			name: "telegram",
			skip: false
		},
		{
			name: "discord",
			skip: false
		},
		{
			name: "slack",
			skip: false
		},
		{
			name: "canvas",
			skip: false
		},
		{
			name: "workspace",
			skip: false
		},
		{
			name: "identity",
			skip: false
		},
		{
			name: "backups",
			skip: false
		},
		{
			name: "openclaw-weixin",
			skip: false
		},
		{
			name: "delivery-queue",
			skip: false
		},
		{
			name: "completions",
			skip: false
		}
	];
	for (const dir of dataDirs) {
		if (dir.skip) {
			console.log(`Skipping ${dir.name}...`);
			continue;
		}
		console.log(`Migrating ${dir.name}...`);
		const openclawDataDir = path.join(detectedOpenClawDir, dir.name);
		const stableclawDataDir = path.join(stableclawDir, dir.name);
		if (!fsSync.existsSync(openclawDataDir)) continue;
		if (options.dryRun) {
			const entries = await fsSync.promises.readdir(openclawDataDir);
			console.log(`[DRY RUN] Would copy ${entries.length} items from ${dir.name}: ${openclawDataDir} → ${stableclawDataDir}`);
			result.migratedItems.push(`${dir.name} (${entries.length})`);
		} else {
			const dirResult = await copyDirectoryWithBackup(openclawDataDir, stableclawDataDir, options);
			if (dirResult.ok) {
				const entries = await fsSync.promises.readdir(stableclawDataDir);
				result.migratedItems.push(`${dir.name} (${entries.length})`);
				console.log(`✓ Migrated ${dir.name} (${entries.length} items)`);
			} else {
				result.errors.push(`${dir.name} migration failed: ${dirResult.error}`);
				console.error(`✗ ${dir.name} migration failed: ${dirResult.error}`);
			}
		}
	}
	for (const file of [{
		src: "exec-approvals.json",
		dest: "exec-approvals.json"
	}]) {
		const srcFile = path.join(detectedOpenClawDir, file.src);
		const destFile = path.join(stableclawDir, file.dest);
		if (!fsSync.existsSync(srcFile)) continue;
		console.log(`Migrating ${file.src}...`);
		if (options.dryRun) {
			console.log(`[DRY RUN] Would copy: ${srcFile} → ${destFile}`);
			result.migratedItems.push(file.src);
		} else {
			const fileResult = await copyFileWithBackup(srcFile, destFile, options);
			if (fileResult.ok) {
				result.migratedItems.push(file.src);
				console.log(`✓ Migrated ${file.src}`);
			} else {
				result.errors.push(`${file.src} migration failed: ${fileResult.error}`);
				console.error(`✗ ${file.src} migration failed: ${fileResult.error}`);
			}
		}
	}
	console.log("\n" + "=".repeat(50));
	console.log("Migration Summary");
	console.log("=".repeat(50));
	console.log(`Source:           ${detectedOpenClawDir}`);
	console.log(`Target:           ${stableclawDir}`);
	console.log(`Status:           ${result.errors.length === 0 ? "✅ Completed" : result.migratedItems.length > 0 ? "⚠️  Partial" : "❌ Failed"}`);
	console.log(`Migrated Items:   ${result.migratedItems.join(", ") || "None"}`);
	if (result.warnings.length > 0) {
		console.log("\nWarnings:");
		result.warnings.forEach((w) => console.log(`  - ${w}`));
	}
	if (result.errors.length > 0) {
		console.log("\nErrors:");
		result.errors.forEach((e) => console.error(`  - ${e}`));
		result.status = result.migratedItems.length > 0 ? "partial" : "failed";
	} else {
		result.ok = true;
		result.status = "completed";
		console.log("\n✅ Migration completed successfully!");
		console.log("\nNext steps:");
		console.log("  1. Run 'stableclaw config get' to verify configuration");
		console.log("  2. Run 'stableclaw plugins list' to verify plugins");
		console.log("  3. Run 'stableclaw gateway run' to start using StableClaw");
	}
	return result;
}
async function getMigrationSummary() {
	const detection = await detectRunningOpenClaw();
	const openclawDir = await autoDetectOpenClawDir();
	return {
		openclawExists: openclawDir !== null,
		stableclawExists: checkStableClawExists(),
		openclawDir,
		stableclawDir: getStableClawDir(),
		openclawRunning: detection.isRunning,
		openclawPid: detection.pid
	};
}
//#endregion
//#region src/cli/migrate-cli.ts
async function formatMigrationSummary(summary) {
	const lines = [];
	lines.push(`${theme.heading("Migration Status:")}`);
	lines.push(`  OpenClaw directory:     ${summary.openclawDir || "Not found"}`);
	lines.push(`  OpenClaw exists:        ${summary.openclawExists ? "✓ Yes" : "✗ No"}`);
	lines.push(`  OpenClaw running:       ${summary.openclawRunning ? `✓ Yes (PID: ${summary.openclawPid})` : "✗ No"}`);
	lines.push(`  StableClaw directory:   ${summary.stableclawDir}`);
	lines.push(`  StableClaw exists:      ${summary.stableclawExists ? "✓ Yes" : "✗ No"}`);
	return lines.join("\n");
}
function registerMigrateCli(program) {
	const migrate = program.command("migrate").description("Migrate from other OpenClaw-based projects");
	migrate.command("from-openclaw").description("Migrate configuration, plugins, and data from OpenClaw to StableClaw").option("--dry-run", "Preview migration without making changes", false).option("--skip-plugins", "Skip plugin migration", false).option("--skip-credentials", "Skip credentials migration", false).option("--skip-logs", "Skip logs migration", false).option("--skip-memory", "Skip memory migration", false).option("--skip-tasks", "Skip tasks migration", false).option("--force", "Force migration even if StableClaw already exists", false).option("--openclaw-dir <path>", "Manually specify OpenClaw configuration directory").action(async (opts) => {
		try {
			console.log(theme.heading("\n🔄 OpenClaw → StableClaw Migration\n"));
			const summary = await getMigrationSummary();
			console.log(await formatMigrationSummary(summary));
			console.log();
			if (!summary.openclawExists && !opts.openclawDir) {
				defaultRuntime.error("OpenClaw installation not found.");
				console.log("\n💡 Suggestions:");
				console.log("  1. Start OpenClaw first, then run this command again");
				console.log("  2. Or use --openclaw-dir to manually specify the path");
				console.log("\nExample:");
				console.log("  stableclaw migrate from-openclaw --openclaw-dir ~/.openclaw");
				defaultRuntime.exit(1);
				return;
			}
			if (summary.stableclawExists && !opts.force) {
				defaultRuntime.error("StableClaw already exists.");
				console.log("\nUse --force to overwrite or merge existing data.");
				defaultRuntime.exit(1);
				return;
			}
			if (opts.dryRun) console.log(theme.muted("🔍 DRY RUN MODE - No changes will be made\n"));
			if (!opts.dryRun && !opts.force) {
				const { promptYesNo } = await import("./prompt-COzf5LIJ.js");
				if (!await promptYesNo("Proceed with migration?", false)) {
					console.log("Migration cancelled.");
					defaultRuntime.exit(0);
					return;
				}
			}
			if ((await migrateFromOpenClaw({
				source: "openclaw",
				dryRun: opts.dryRun,
				skipPlugins: opts.skipPlugins,
				skipCredentials: opts.skipCredentials,
				skipLogs: opts.skipLogs,
				skipMemory: opts.skipMemory,
				skipTasks: opts.skipTasks,
				force: opts.force,
				openclawDir: opts.openclawDir
			})).ok) defaultRuntime.exit(0);
			else defaultRuntime.exit(1);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			defaultRuntime.error(`Migration failed: ${errorMsg}`);
			defaultRuntime.exit(1);
		}
	});
	migrate.command("status").description("Check migration status and available sources").action(async () => {
		console.log(theme.heading("\n📊 Migration Status\n"));
		const summary = await getMigrationSummary();
		console.log(await formatMigrationSummary(summary));
		if (summary.openclawExists && !summary.stableclawExists) {
			console.log("\n" + theme.success("✓ Ready to migrate from OpenClaw"));
			console.log("\nRun: stableclaw migrate from-openclaw");
		} else if (summary.stableclawExists) {
			console.log("\n" + theme.muted("StableClaw already installed"));
			if (summary.openclawExists) console.log("Use --force to re-migrate from OpenClaw");
		} else {
			console.log("\n" + theme.muted("No OpenClaw installation found"));
			console.log("\nTo get started:");
			console.log("  1. Install StableClaw: npm install -g stableclaw");
			console.log("  2. Run setup: stableclaw onboard");
		}
		console.log();
	});
}
//#endregion
export { registerMigrateCli };
