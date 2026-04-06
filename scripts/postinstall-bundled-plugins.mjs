#!/usr/bin/env node
// Runs after install to restore bundled extension runtime deps.
// Installed builds can lazy-load bundled plugin code through root dist chunks,
// so runtime dependencies declared in dist/extensions/*/package.json must also
// resolve from the package root node_modules. Skip source checkouts.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveNpmRunner } from "./npm-runner.mjs";

export const BUNDLED_PLUGIN_INSTALL_TARGETS = [];

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_EXTENSIONS_DIR = join(__dirname, "..", "dist", "extensions");
const DEFAULT_PACKAGE_ROOT = join(__dirname, "..");
const DISABLE_POSTINSTALL_ENV = "OPENCLAW_DISABLE_BUNDLED_PLUGIN_POSTINSTALL";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function dependencySentinelPath(depName) {
  return join("node_modules", ...depName.split("/"), "package.json");
}

function collectRuntimeDeps(packageJson) {
  return {
    ...packageJson.dependencies,
    ...packageJson.optionalDependencies,
  };
}

export function discoverBundledPluginRuntimeDeps(params = {}) {
  const extensionsDir = params.extensionsDir ?? DEFAULT_EXTENSIONS_DIR;
  const pathExists = params.existsSync ?? existsSync;
  const readDir = params.readdirSync ?? readdirSync;
  const readJsonFile = params.readJson ?? readJson;
  const deps = new Map(
    BUNDLED_PLUGIN_INSTALL_TARGETS.map((target) => [
      target.name,
      {
        name: target.name,
        version: target.version,
        sentinelPath: dependencySentinelPath(target.name),
        pluginIds: [...(target.pluginIds ?? [])],
      },
    ]),
  );

  if (!pathExists(extensionsDir)) {
    return [...deps.values()].toSorted((a, b) => a.name.localeCompare(b.name));
  }

  for (const entry of readDir(extensionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const pluginId = entry.name;
    const packageJsonPath = join(extensionsDir, pluginId, "package.json");
    if (!pathExists(packageJsonPath)) {
      continue;
    }
    try {
      const packageJson = readJsonFile(packageJsonPath);
      for (const [name, version] of Object.entries(collectRuntimeDeps(packageJson))) {
        const existing = deps.get(name);
        if (existing) {
          if (existing.version !== version) {
            continue;
          }
          if (!existing.pluginIds.includes(pluginId)) {
            existing.pluginIds.push(pluginId);
          }
          continue;
        }
        deps.set(name, {
          name,
          version,
          sentinelPath: dependencySentinelPath(name),
          pluginIds: [pluginId],
        });
      }
    } catch {
      // Ignore malformed plugin manifests; runtime will surface those separately.
    }
  }

  return [...deps.values()]
    .map((dep) => ({
      ...dep,
      pluginIds: [...dep.pluginIds].toSorted((a, b) => a.localeCompare(b)),
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

export function createNestedNpmInstallEnv(env = process.env) {
  const nextEnv = { ...env };
  delete nextEnv.npm_config_global;
  delete nextEnv.npm_config_location;
  delete nextEnv.npm_config_prefix;
  return nextEnv;
}

function isSourceCheckoutRoot(params) {
  const pathExists = params.existsSync ?? existsSync;
  return (
    pathExists(join(params.packageRoot, ".git")) &&
    pathExists(join(params.packageRoot, "src")) &&
    pathExists(join(params.packageRoot, "extensions"))
  );
}

function shouldRunBundledPluginPostinstall(params) {
  if (params.env?.[DISABLE_POSTINSTALL_ENV]?.trim()) {
    return false;
  }
  if (!params.existsSync(params.extensionsDir)) {
    return false;
  }
  if (isSourceCheckoutRoot({ packageRoot: params.packageRoot, existsSync: params.existsSync })) {
    return false;
  }
  return true;
}

export function runBundledPluginPostinstall(params = {}) {
  const env = params.env ?? process.env;
  const extensionsDir = params.extensionsDir ?? DEFAULT_EXTENSIONS_DIR;
  const packageRoot = params.packageRoot ?? DEFAULT_PACKAGE_ROOT;
  const spawn = params.spawnSync ?? spawnSync;
  const pathExists = params.existsSync ?? existsSync;
  const log = params.log ?? console;
  if (
    !shouldRunBundledPluginPostinstall({
      env,
      extensionsDir,
      packageRoot,
      existsSync: pathExists,
    })
  ) {
    return;
  }
  const runtimeDeps =
    params.runtimeDeps ??
    discoverBundledPluginRuntimeDeps({ extensionsDir, existsSync: pathExists });
  const missingSpecs = runtimeDeps
    .filter((dep) => !pathExists(join(packageRoot, dep.sentinelPath)))
    .map((dep) => `${dep.name}@${dep.version}`);

  if (missingSpecs.length === 0) {
    return;
  }

  try {
    const nestedEnv = createNestedNpmInstallEnv(env);
    const npmRunner =
      params.npmRunner ??
      resolveNpmRunner({
        env: nestedEnv,
        execPath: params.execPath,
        existsSync: pathExists,
        platform: params.platform,
        comSpec: params.comSpec,
        npmArgs: ["install", "--omit=dev", "--no-save", "--package-lock=false", ...missingSpecs],
      });
    const result = spawn(npmRunner.command, npmRunner.args, {
      cwd: packageRoot,
      encoding: "utf8",
      env: npmRunner.env ?? nestedEnv,
      stdio: "pipe",
      shell: npmRunner.shell,
      windowsVerbatimArguments: npmRunner.windowsVerbatimArguments,
    });
    if (result.status !== 0) {
      const output = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
      throw new Error(output || "npm install failed");
    }
    log.log(`[postinstall] installed bundled plugin deps: ${missingSpecs.join(", ")}`);
  } catch (e) {
    // Non-fatal: gateway will surface the missing dep via doctor.
    log.warn(`[postinstall] could not install bundled plugin deps: ${String(e)}`);
  }
}

/**
 * Auto-install and start the Gateway daemon service after npm install.
 * This ensures stableclaw runs in daemon mode by default after installation.
 * Skipped for source checkouts and when OPENCLAW_SKIP_DAEMON_AUTOINSTALL is set.
 */
function runDaemonAutoInstall(params = {}) {
  const env = params.env ?? process.env;
  const log = params.log ?? console;
  const packageRoot = params.packageRoot ?? DEFAULT_PACKAGE_ROOT;
  const spawn = params.spawnSync ?? spawnSync;
  const pathExists = params.existsSync ?? existsSync;

  // Skip in source checkouts
  if (isSourceCheckoutRoot({ packageRoot, existsSync: pathExists })) {
    return;
  }

  // Allow opt-out
  if (env.OPENCLAW_SKIP_DAEMON_AUTOINSTALL?.trim()) {
    log.log("[postinstall] skipping daemon auto-install (OPENCLAW_SKIP_DAEMON_AUTOINSTALL is set)");
    return;
  }

  // Resolve the stableclaw binary path
  const platform = process.platform;
  const binName = platform === "win32" ? "stableclaw.cmd" : "stableclaw";
  let binPath = join(packageRoot, binName);

  // For global installs, the bin might be symlinked elsewhere
  if (!pathExists(binPath)) {
    // Try to find it in node_modules/.bin or global bin dir
    const globalNodeModules = dirname(dirname(process.execPath));
    const possiblePaths = [
      join(globalNodeModules, binName),
      join("/usr/local/bin", binName),
      join("/usr/bin", binName),
    ];
    for (const p of possiblePaths) {
      if (pathExists(p)) {
        binPath = p;
        break;
      }
    }
  }

  if (!pathExists(binPath)) {
    log.log("[postinstall] stableclaw binary not found, skipping daemon auto-install");
    return;
  }

  log.log("[postinstall] auto-installing Gateway daemon service...");

  // Install the daemon service (--force to overwrite if already exists)
  const installResult = spawn(binPath, ["daemon", "install", "--force", "--json"], {
    encoding: "utf8",
    env: { ...env, OPENCLAW_SKIP_DAEMON_AUTOINSTALL: "1" },
    stdio: "pipe",
    shell: platform === "win32",
  });

  if (installResult.status === 0) {
    log.log("[postinstall] Gateway daemon service installed successfully");

    // Start the daemon service
    log.log("[postinstall] starting Gateway daemon service...");
    const startResult = spawn(binPath, ["daemon", "start", "--json"], {
      encoding: "utf8",
      env: { ...env, OPENCLAW_SKIP_DAEMON_AUTOINSTALL: "1" },
      stdio: "pipe",
      shell: platform === "win32",
    });

    if (startResult.status === 0) {
      log.log("[postinstall] Gateway daemon service started successfully");
    } else {
      log.warn(
        `[postinstall] failed to start daemon service: ${startResult.stderr || startResult.stdout || "unknown error"}`,
      );
    }
  } else {
    log.warn(
      `[postinstall] failed to install daemon service: ${installResult.stderr || installResult.stdout || "unknown error"}`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runBundledPluginPostinstall();
  // After bundled plugins are installed, auto-install daemon mode
  runDaemonAutoInstall();
}
