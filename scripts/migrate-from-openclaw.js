#!/usr/bin/env node

/**
 * OpenClaw → StableClaw Migration Script
 * 
 * This standalone script migrates your OpenClaw configuration, plugins,
 * credentials, and data to StableClaw without requiring StableClaw to be installed.
 * 
 * Features:
 * - Auto-detects running OpenClaw process
 * - Extracts configuration directory from running process
 * - Migrates all data seamlessly
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
 *   --openclaw-dir       Manually specify OpenClaw directory
 *   --help               Show this help message
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

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
  muted: '\x1b[2m',
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

/**
 * Detect running OpenClaw process
 */
async function detectRunningOpenClaw() {
  try {
    const platform = os.platform();
    
    if (platform === 'win32') {
      // Windows: use tasklist
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /V');
      const lines = stdout.split('\n').slice(1); // Skip header
      
      for (const line of lines) {
        if (line.includes('openclaw') || line.includes('stableclaw')) {
          // Parse CSV line
          const match = line.match(/"node\.exe","(\d+)"/);
          if (match) {
            const pid = parseInt(match[1]);
            
            // Try to get command line
            try {
              const { stdout: cmdline } = await execAsync(`wmic process where ProcessId=${pid} get CommandLine /format:list`);
              const cmdMatch = cmdline.match(/CommandLine=(.+)/);
              
              if (cmdMatch) {
                const cmdLine = cmdMatch[1].trim();
                
                // Extract config directory from command line
                const configDirMatch = cmdLine.match(/--config-dir[= ]([^\s]+)/);
                const homeDir = path.join(os.homedir(), OPENCLAW_DIR);
                
                return {
                  isRunning: true,
                  pid,
                  configDir: configDirMatch ? configDirMatch[1] : homeDir,
                  commandLine: cmdLine,
                };
              }
            } catch {
              // If we can't get command line, just return PID
              return {
                isRunning: true,
                pid,
                configDir: path.join(os.homedir(), OPENCLAW_DIR),
              };
            }
          }
        }
      }
    } else {
      // Linux/macOS: use ps
      const { stdout } = await execAsync('ps aux | grep -E "openclaw|stableclaw" | grep -v grep');
      const lines = stdout.split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        // Parse ps output
        const parts = line.split(/\s+/);
        const pid = parseInt(parts[1]);
        const cmdLine = parts.slice(10).join(' ');
        
        // Extract config directory from command line
        const configDirMatch = cmdLine.match(/--config-dir[= ]([^\s]+)/);
        const homeDir = path.join(os.homedir(), OPENCLAW_DIR);
        
        return {
          isRunning: true,
          pid,
          configDir: configDirMatch ? configDirMatch[1] : homeDir,
          commandLine: cmdLine,
        };
      }
    }
    
    return { isRunning: false };
  } catch (error) {
    // No running process found or command failed
    return { isRunning: false };
  }
}

/**
 * Auto-detect OpenClaw configuration directory
 */
async function autoDetectOpenClawDir() {
  // 1. Check environment variable
  const envDir = process.env.OPENCLAW_CONFIG_DIR;
  if (envDir && fs.existsSync(envDir)) {
    return envDir;
  }
  
  // 2. Check if OpenClaw is running and extract from process
  const detection = await detectRunningOpenClaw();
  if (detection.isRunning && detection.configDir && fs.existsSync(detection.configDir)) {
    return detection.configDir;
  }
  
  // 3. Check default locations
  const defaultDir = path.join(os.homedir(), OPENCLAW_DIR);
  if (fs.existsSync(defaultDir)) {
    return defaultDir;
  }
  
  // 4. Check alternative locations
  const altDirs = [
    path.join(os.homedir(), '.config', 'openclaw'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'openclaw'), // Windows
    path.join(os.homedir(), 'Library', 'Application Support', 'openclaw'), // macOS
  ];
  
  for (const dir of altDirs) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  
  return null;
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
    openclawDir: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--skip-plugins') options.skipPlugins = true;
    else if (arg === '--skip-credentials') options.skipCredentials = true;
    else if (arg === '--skip-logs') options.skipLogs = true;
    else if (arg === '--skip-memory') options.skipMemory = true;
    else if (arg === '--skip-tasks') options.skipTasks = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--create-backup') options.createBackup = true;
    else if (arg === '--openclaw-dir' && i + 1 < args.length) {
      options.openclawDir = args[++i];
    }
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

  // Step 1: Detect OpenClaw installation
  log('Step 1: Detecting OpenClaw installation...\n', 'bright');
  
  let openclawDir = options.openclawDir;
  
  // Check if OpenClaw is running
  const detection = await detectRunningOpenClaw();
  if (detection.isRunning) {
    success(`OpenClaw is running (PID: ${detection.pid})`);
    if (detection.configDir) {
      log(`Found config directory: ${detection.configDir}`);
      openclawDir = openclawDir || detection.configDir;
    }
  } else {
    info('OpenClaw is not running');
  }
  
  // Auto-detect if not found from running process
  if (!openclawDir) {
    console.log('\nSearching for OpenClaw configuration directory...');
    openclawDir = await autoDetectOpenClawDir();
    
    if (openclawDir) {
      success(`Found OpenClaw directory: ${openclawDir}`);
    } else {
      error('OpenClaw configuration directory not found');
      console.log('\n💡 Suggestion: Please start OpenClaw first, or manually specify:');
      console.log('   node migrate-from-openclaw.js --openclaw-dir <path>');
      process.exit(1);
    }
  }
  
  // Verify OpenClaw directory exists
  const openclawExists = fs.existsSync(openclawDir);
  if (!openclawExists) {
    error(`OpenClaw directory does not exist: ${openclawDir}`);
    process.exit(1);
  }

  // Show migration status
  const stableclawDir = getStableClawDir();
  const stableclawExists = fs.existsSync(stableclawDir);

  console.log();
  log('Migration Status:', 'bright');
  console.log(`  OpenClaw directory:     ${openclawDir}`);
  console.log(`  OpenClaw exists:        ${openclawExists ? '✓ Yes' : '✗ No'}`);
  console.log(`  OpenClaw running:       ${detection.isRunning ? `✓ Yes (PID: ${detection.pid})` : '✗ No'}`);
  console.log(`  StableClaw directory:   ${stableclawDir}`);
  console.log(`  StableClaw exists:      ${stableclawExists ? '✓ Yes' : '✗ No'}`);
  console.log();

  // Check if StableClaw exists
  if (stableclawExists && !options.force) {
    error('StableClaw already exists.');
    console.log('\nUse --force to overwrite or merge existing data.');
    process.exit(1);
  }

  // Dry run warning
  if (options.dryRun) {
    log('🔍 DRY RUN MODE - No changes will be made\n', 'cyan');
  }

  // Step 2: Perform migration
  log('Step 2: Starting migration...\n', 'bright');

  // Create StableClaw directory
  if (!options.dryRun) {
    fs.mkdirSync(stableclawDir, { recursive: true });
  }

  const migratedItems = [];
  const warnings = [];
  const errors = [];

  // Migrate config
  log('Migrating configuration...', 'cyan');
  const openclawConfig = path.join(openclawDir, 'openclaw.json');
  const stableclawConfig = path.join(stableclawDir, 'stableclaw.json');
  
  if (!fs.existsSync(openclawConfig)) {
    warnings.push('OpenClaw config file not found');
  } else {
    if (options.dryRun) {
      info(`[DRY RUN] Would copy: ${openclawConfig} → ${stableclawConfig}`);
      migratedItems.push('config');
    } else {
      const configResult = await copyFile(openclawConfig, stableclawConfig, options);
      if (configResult.ok) {
        migratedItems.push('config');
        success('Configuration migrated');
      } else {
        errors.push(`Config migration failed: ${configResult.error}`);
        error(`Configuration migration failed: ${configResult.error}`);
      }
    }
  }

  // Migrate plugins
  log('Migrating plugins...', 'cyan');
  if (!options.skipPlugins) {
    const openclawPlugins = path.join(openclawDir, 'extensions');
    const stableclawPlugins = path.join(stableclawDir, 'extensions');
    
    if (fs.existsSync(openclawPlugins)) {
      if (options.dryRun) {
        const entries = fs.readdirSync(openclawPlugins, { withFileTypes: true });
        const pluginCount = entries.filter(e => e.isDirectory()).length;
        info(`[DRY RUN] Would copy ${pluginCount} plugins`);
        migratedItems.push(`plugins (${pluginCount})`);
      } else {
        const pluginsResult = await copyDirectory(openclawPlugins, stableclawPlugins, options);
        if (pluginsResult.ok) {
          const entries = fs.readdirSync(stableclawPlugins, { withFileTypes: true });
          const pluginCount = entries.filter(e => e.isDirectory()).length;
          migratedItems.push(`plugins (${pluginCount})`);
          success(`Migrated ${pluginCount} plugins`);
        } else {
          errors.push(`Plugins migration failed: ${pluginsResult.error}`);
          error(`Plugins migration failed: ${pluginsResult.error}`);
        }
      }
    } else {
      warnings.push('No plugins found to migrate');
    }
  } else {
    info('Skipping plugins migration');
  }

  // Migrate credentials
  log('Migrating credentials...', 'cyan');
  if (!options.skipCredentials) {
    const openclawCreds = path.join(openclawDir, 'credentials');
    const stableclawCreds = path.join(stableclawDir, 'credentials');
    
    if (fs.existsSync(openclawCreds)) {
      if (options.dryRun) {
        const entries = fs.readdirSync(openclawCreds);
        info(`[DRY RUN] Would copy ${entries.length} credential files`);
        migratedItems.push(`credentials (${entries.length})`);
      } else {
        const credsResult = await copyDirectory(openclawCreds, stableclawCreds, options);
        if (credsResult.ok) {
          const entries = fs.readdirSync(stableclawCreds);
          migratedItems.push(`credentials (${entries.length})`);
          success(`Migrated ${entries.length} credential files`);
        } else {
          errors.push(`Credentials migration failed: ${credsResult.error}`);
          error(`Credentials migration failed: ${credsResult.error}`);
        }
      }
    } else {
      warnings.push('No credentials found to migrate');
    }
  } else {
    info('Skipping credentials migration');
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
    if (dir.skip) {
      console.log(`Skipping ${dir.name}...`);
      continue;
    }
    
    log(`Migrating ${dir.name}...`, 'cyan');
    const openclawDataDir = path.join(openclawDir, dir.name);
    const stableclawDataDir = path.join(stableclawDir, dir.name);
    
    if (!fs.existsSync(openclawDataDir)) {
      continue;
    }
    
    if (options.dryRun) {
      const entries = fs.readdirSync(openclawDataDir);
      info(`[DRY RUN] Would copy ${entries.length} items from ${dir.name}`);
      migratedItems.push(`${dir.name} (${entries.length})`);
    } else {
      const dirResult = await copyDirectory(openclawDataDir, stableclawDataDir, options);
      if (dirResult.ok) {
        const entries = fs.readdirSync(stableclawDataDir);
        migratedItems.push(`${dir.name} (${entries.length})`);
        success(`Migrated ${dir.name} (${entries.length} items)`);
      } else {
        errors.push(`${dir.name} migration failed: ${dirResult.error}`);
        error(`${dir.name} migration failed: ${dirResult.error}`);
      }
    }
  }

  // Print summary
  log('\n' + '='.repeat(50), 'bright');
  log('Migration Summary', 'bright');
  log('='.repeat(50), 'bright');
  log(`Source:           ${openclawDir}`);
  log(`Target:           ${stableclawDir}`);
  log(`Status:           ${errors.length === 0 ? '✅ Completed' : migratedItems.length > 0 ? '⚠️  Partial' : '❌ Failed'}`);
  log(`Migrated Items:   ${migratedItems.join(', ') || 'None'}`);

  if (warnings.length > 0) {
    log('\nWarnings:', 'yellow');
    warnings.forEach(w => warning(w));
  }

  if (errors.length > 0) {
    log('\nErrors:', 'red');
    errors.forEach(e => error(e));
    process.exit(1);
  } else {
    log('\n✅ Migration completed successfully!', 'green');
    log('\nNext steps:', 'cyan');
    log('  1. Install StableClaw: npm install -g stableclaw');
    log('  2. Verify configuration: stableclaw config get');
    log('  3. Check plugins: stableclaw plugins list');
    log('  4. Start gateway: stableclaw gateway run');
  }
}

main().catch(err => {
  error(`Migration failed: ${err.message}`);
  process.exit(1);
});
