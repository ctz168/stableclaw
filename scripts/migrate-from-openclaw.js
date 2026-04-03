#!/usr/bin/env node

/**
 * OpenClaw → StableClaw Migration Script
 * 
 * This standalone script migrates your OpenClaw configuration, plugins,
 * credentials, and data to StableClaw without requiring StableClaw to be installed.
 * 
 * Usage:
 *   node migrate-from-openclaw.js [options]
 * 
 * Options:
 *   --dry-run            Preview migration without making changes
 *   --skip-plugins       Skip plugin migration
 *   --skip-credentials   Skip credentials migration
 *   --skip-logs          Skip logs migration
 *   --skip-memory        Skip memory migration
 *   --skip-tasks         Skip tasks migration
 *   --force              Force migration even if StableClaw exists
 *   --create-backup      Create backup of existing StableClaw data
 *   --help               Show this help message
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const OPENCLAW_DIR = '.openclaw';
const STABLECLAW_DIR = '.stableclaw';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  console.error(`${colors.red}✗ ${message}${colors.reset}`);
}

function success(message) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function warning(message) {
  console.log(`${colors.yellow}⚠  ${message}${colors.reset}`);
}

function info(message) {
  console.log(`${colors.cyan}ℹ ${message}${colors.reset}`);
}

function getOpenClawDir() {
  return path.join(os.homedir(), OPENCLAW_DIR);
}

function getStableClawDir() {
  return path.join(os.homedir(), STABLECLAW_DIR);
}

function checkOpenClawExists() {
  return fs.existsSync(getOpenClawDir());
}

function checkStableClawExists() {
  return fs.existsSync(getStableClawDir());
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    skipPlugins: false,
    skipCredentials: false,
    skipLogs: false,
    skipMemory: false,
    skipTasks: false,
    force: false,
    createBackup: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--skip-plugins') options.skipPlugins = true;
    else if (arg === '--skip-credentials') options.skipCredentials = true;
    else if (arg === '--skip-logs') options.skipLogs = true;
    else if (arg === '--skip-memory') options.skipMemory = true;
    else if (arg === '--skip-tasks') options.skipTasks = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--create-backup') options.createBackup = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
  }

  return options;
}

function showHelp() {
  console.log(`
${colors.bright}OpenClaw → StableClaw Migration Script${colors.reset}

This script migrates your OpenClaw configuration, plugins, credentials, and data
to StableClaw without requiring StableClaw to be installed.

${colors.bright}Usage:${colors.reset}
  node migrate-from-openclaw.js [options]

${colors.bright}Options:${colors.reset}
  --dry-run            Preview migration without making changes
  --skip-plugins       Skip plugin migration
  --skip-credentials   Skip credentials migration
  --skip-logs          Skip logs migration
  --skip-memory        Skip memory migration
  --skip-tasks         Skip tasks migration
  --force              Force migration even if StableClaw exists
  --create-backup      Create backup of existing StableClaw data
  --help, -h           Show this help message

${colors.bright}Examples:${colors.reset}
  # Preview migration
  node migrate-from-openclaw.js --dry-run

  # Full migration with backup
  node migrate-from-openclaw.js --create-backup

  # Migrate only config and credentials
  node migrate-from-openclaw.js --skip-plugins --skip-logs --skip-memory --skip-tasks

${colors.bright}Migration Items:${colors.reset}
  - Configuration file (openclaw.json → stableclaw.json)
  - Installed plugins (extensions/)
  - Credentials (credentials/)
  - Logs (logs/)
  - Memory (memory/)
  - Tasks (tasks/)
  - Devices, agents, telegram, discord, slack, canvas, workspace

${colors.bright}After Migration:${colors.reset}
  1. Install StableClaw: npm install -g stableclaw
  2. Verify configuration: stableclaw config get
  3. Check plugins: stableclaw plugins list
  4. Start gateway: stableclaw gateway run
`);
}

async function copyFile(source, target, options) {
  try {
    if (!fs.existsSync(source)) {
      return { ok: false, error: `Source not found: ${source}` };
    }

    if (fs.existsSync(target) && options.createBackup) {
      const backupPath = `${target}.backup-${Date.now()}`;
      fs.copyFileSync(target, backupPath);
    }

    const targetDir = path.dirname(target);
    fs.mkdirSync(targetDir, { recursive: true });

    fs.copyFileSync(source, target);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function copyDirectory(source, target, options) {
  try {
    if (!fs.existsSync(source)) {
      return { ok: false, error: `Source not found: ${source}` };
    }

    if (fs.existsSync(target) && options.createBackup) {
      const backupPath = `${target}.backup-${Date.now()}`;
      fs.cpSync(source, backupPath, { recursive: true });
    }

    fs.mkdirSync(target, { recursive: true });

    const entries = fs.readdirSync(source, { withFileTypes: true });
    const skipped = [];

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        const result = await copyDirectory(sourcePath, targetPath, options);
        if (!result.ok) {
          skipped.push(entry.name);
        }
      } else if (entry.isFile()) {
        const result = await copyFile(sourcePath, targetPath, options);
        if (!result.ok) {
          skipped.push(entry.name);
        }
      }
    }

    return { ok: true, skipped };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function migrateConfig(options) {
  const openclawConfig = path.join(getOpenClawDir(), 'openclaw.json');
  const stableclawConfig = path.join(getStableClawDir(), 'stableclaw.json');

  if (!fs.existsSync(openclawConfig)) {
    return { ok: false, error: 'OpenClaw config not found' };
  }

  if (options.dryRun) {
    info(`[DRY RUN] Would copy: ${openclawConfig} → ${stableclawConfig}`);
    return { ok: true };
  }

  return await copyFile(openclawConfig, stableclawConfig, options);
}

async function migratePlugins(options) {
  if (options.skipPlugins) {
    return { ok: true, count: 0 };
  }

  const openclawPlugins = path.join(getOpenClawDir(), 'extensions');
  const stableclawPlugins = path.join(getStableClawDir(), 'extensions');

  if (!fs.existsSync(openclawPlugins)) {
    return { ok: true, count: 0 };
  }

  if (options.dryRun) {
    const entries = fs.readdirSync(openclawPlugins, { withFileTypes: true });
    const pluginCount = entries.filter(e => e.isDirectory()).length;
    info(`[DRY RUN] Would copy ${pluginCount} plugins`);
    return { ok: true, count: pluginCount };
  }

  const result = await copyDirectory(openclawPlugins, stableclawPlugins, options);
  if (result.ok) {
    const entries = fs.readdirSync(stableclawPlugins, { withFileTypes: true });
    const pluginCount = entries.filter(e => e.isDirectory()).length;
    return { ok: true, count: pluginCount };
  }

  return { ok: false, error: result.error };
}

async function migrateCredentials(options) {
  if (options.skipCredentials) {
    return { ok: true, count: 0 };
  }

  const openclawCreds = path.join(getOpenClawDir(), 'credentials');
  const stableclawCreds = path.join(getStableClawDir(), 'credentials');

  if (!fs.existsSync(openclawCreds)) {
    return { ok: true, count: 0 };
  }

  if (options.dryRun) {
    const entries = fs.readdirSync(openclawCreds);
    info(`[DRY RUN] Would copy ${entries.length} credential files`);
    return { ok: true, count: entries.length };
  }

  const result = await copyDirectory(openclawCreds, stableclawCreds, options);
  if (result.ok) {
    const entries = fs.readdirSync(stableclawCreds);
    return { ok: true, count: entries.length };
  }

  return { ok: false, error: result.error };
}

async function migrateDataDir(dirName, options, skip = false) {
  if (skip) {
    return { ok: true, count: 0 };
  }

  const openclawDir = path.join(getOpenClawDir(), dirName);
  const stableclawDir = path.join(getStableClawDir(), dirName);

  if (!fs.existsSync(openclawDir)) {
    return { ok: true, count: 0 };
  }

  if (options.dryRun) {
    const entries = fs.readdirSync(openclawDir);
    info(`[DRY RUN] Would copy ${entries.length} items from ${dirName}`);
    return { ok: true, count: entries.length };
  }

  const result = await copyDirectory(openclawDir, stableclawDir, options);
  if (result.ok) {
    const entries = fs.readdirSync(stableclawDir);
    return { ok: true, count: entries.length };
  }

  return { ok: false, error: result.error };
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  log('\n🔄 OpenClaw → StableClaw Migration\n', 'bright');

  // Check if OpenClaw exists
  if (!checkOpenClawExists()) {
    error('OpenClaw installation not found. Cannot proceed.');
    process.exit(1);
  }

  // Check if StableClaw exists
  if (checkStableClawExists() && !options.force) {
    error('StableClaw already exists. Use --force to overwrite.');
    process.exit(1);
  }

  // Dry run warning
  if (options.dryRun) {
    log('🔍 DRY RUN MODE - No changes will be made\n', 'cyan');
  }

  // Create StableClaw directory
  if (!options.dryRun) {
    fs.mkdirSync(getStableClawDir(), { recursive: true });
  }

  const migratedItems = [];
  const warnings = [];
  const errors = [];

  // Migrate config
  log('Migrating configuration...', 'cyan');
  const configResult = await migrateConfig(options);
  if (configResult.ok) {
    migratedItems.push('config');
    success('Configuration migrated');
  } else {
    errors.push(`Config migration failed: ${configResult.error}`);
    error(`Configuration migration failed: ${configResult.error}`);
  }

  // Migrate plugins
  log('Migrating plugins...', 'cyan');
  const pluginsResult = await migratePlugins(options);
  if (pluginsResult.ok) {
    if (pluginsResult.count > 0) {
      migratedItems.push(`plugins (${pluginsResult.count})`);
      success(`Migrated ${pluginsResult.count} plugins`);
    } else {
      warnings.push('No plugins found to migrate');
    }
  } else {
    errors.push(`Plugins migration failed: ${pluginsResult.error}`);
    error(`Plugins migration failed: ${pluginsResult.error}`);
  }

  // Migrate credentials
  log('Migrating credentials...', 'cyan');
  const credsResult = await migrateCredentials(options);
  if (credsResult.ok) {
    if (credsResult.count > 0) {
      migratedItems.push(`credentials (${credsResult.count})`);
      success(`Migrated ${credsResult.count} credential files`);
    } else {
      warnings.push('No credentials found to migrate');
    }
  } else {
    errors.push(`Credentials migration failed: ${credsResult.error}`);
    error(`Credentials migration failed: ${credsResult.error}`);
  }

  // Migrate data directories
  const dataDirs = [
    { name: 'logs', skip: options.skipLogs },
    { name: 'memory', skip: options.skipMemory },
    { name: 'tasks', skip: options.skipTasks },
    { name: 'devices', skip: false },
    { name: 'agents', skip: false },
    { name: 'telegram', skip: false },
    { name: 'discord', skip: false },
    { name: 'slack', skip: false },
    { name: 'canvas', skip: false },
    { name: 'workspace', skip: false },
  ];

  for (const dir of dataDirs) {
    log(`Migrating ${dir.name}...`, 'cyan');
    const dirResult = await migrateDataDir(dir.name, options, dir.skip);
    if (dirResult.ok) {
      if (dirResult.count > 0) {
        migratedItems.push(`${dir.name} (${dirResult.count})`);
        success(`Migrated ${dir.name} (${dirResult.count} items)`);
      }
    } else {
      errors.push(`${dir.name} migration failed: ${dirResult.error}`);
      error(`${dir.name} migration failed: ${dirResult.error}`);
    }
  }

  // Print summary
  log('\n' + '='.repeat(50), 'bright');
  log('Migration Summary', 'bright');
  log('='.repeat(50), 'bright');
  log(`Status:           ${errors.length === 0 ? '✅ Completed' : '⚠️  Partial'}`);
  log(`Migrated Items:   ${migratedItems.join(', ') || 'None'}`);

  if (warnings.length > 0) {
    log('\nWarnings:', 'yellow');
    warnings.forEach(w => warning(w));
  }

  if (errors.length > 0) {
    log('\nErrors:', 'red');
    errors.forEach(e => error(e));
  }

  if (errors.length === 0) {
    log('\n✅ Migration completed successfully!', 'green');
    log('\nNext steps:', 'cyan');
    log('  1. Install StableClaw: npm install -g stableclaw');
    log('  2. Verify configuration: stableclaw config get');
    log('  3. Check plugins: stableclaw plugins list');
    log('  4. Start gateway: stableclaw gateway run');
  } else if (migratedItems.length > 0) {
    log('\n⚠️  Migration completed with errors', 'yellow');
  } else {
    log('\n❌ Migration failed', 'red');
    process.exit(1);
  }
}

main().catch(err => {
  error(`Migration failed: ${err.message}`);
  process.exit(1);
});
