export declare const CONFIG_BACKUP_COUNT = 5;
export interface BackupRotationFs {
    unlink: (path: string) => Promise<void>;
    rename: (from: string, to: string) => Promise<void>;
    chmod?: (path: string, mode: number) => Promise<void>;
    readdir?: (path: string) => Promise<string[]>;
}
export interface BackupMaintenanceFs extends BackupRotationFs {
    copyFile: (from: string, to: string) => Promise<void>;
}
/**
 * Optional validator for backup content. Returns true if the content is
 * safe to keep as a backup (i.e. the config is valid). Return false to
 * **reject** the backup — the invalid content must NOT enter the backup ring.
 */
export type BackupContentValidator = (rawContent: string) => boolean;
export type MaintainConfigBackupsOptions = {
    ioFs: BackupMaintenanceFs;
    /**
     * Optional content validator. When provided, the current config file is
     * read and validated BEFORE being copied into the backup ring. If the
     * validator returns false the backup is skipped entirely — the invalid
     * config must never become a .bak file.
     */
    validateBeforeBackup?: BackupContentValidator;
    /** Logger used when a backup is rejected. */
    log?: {
        warn: (msg: string) => void;
    };
};
export declare function rotateConfigBackups(configPath: string, ioFs: BackupRotationFs): Promise<void>;
/**
 * Harden file permissions on all .bak files in the rotation ring.
 * copyFile does not guarantee permission preservation on all platforms
 * (e.g. Windows, some NFS mounts), so we explicitly chmod each backup
 * to owner-only (0o600) to match the main config file.
 */
export declare function hardenBackupPermissions(configPath: string, ioFs: BackupRotationFs): Promise<void>;
/**
 * Remove orphan .bak files that fall outside the managed rotation ring.
 * These can accumulate from interrupted writes, manual copies, or PID-stamped
 * backups (e.g. openclaw.json.bak.1772352289, openclaw.json.bak.before-marketing).
 *
 * Only files matching `<configBasename>.bak.*` are considered; the primary
 * `.bak` and numbered `.bak.1` through `.bak.{N-1}` are preserved.
 */
export declare function cleanOrphanBackups(configPath: string, ioFs: BackupRotationFs): Promise<void>;
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
export declare function maintainConfigBackups(configPath: string, ioFs: BackupMaintenanceFs, options?: MaintainConfigBackupsOptions): Promise<void>;
