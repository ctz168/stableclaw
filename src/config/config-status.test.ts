import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  getConfigStatus,
  setConfigStatus,
  markConfigValid,
  markConfigInvalid,
  markConfigRollingBack,
  wasLastConfigInvalid,
  clearConfigStatus,
  resolveConfigStatusPath,
  type ConfigErrorStatus,
} from "./config-status.js";

describe("config-status", () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-status-test-"));
    originalEnv = { ...process.env };
    process.env.OPENCLAW_STATE_DIR = tempDir;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  describe("resolveConfigStatusPath", () => {
    it("returns the correct path for config status file", () => {
      const statusPath = resolveConfigStatusPath();
      expect(statusPath).toBe(path.join(tempDir, "config-status.json"));
    });
  });

  describe("getConfigStatus", () => {
    it("returns default valid status when no status file exists", () => {
      const status = getConfigStatus();
      expect(status.status).toBe("valid");
      expect(status.timestamp).toBeDefined();
    });

    it("returns the stored status when file exists", () => {
      const testStatus: ConfigErrorStatus = {
        status: "invalid",
        timestamp: new Date().toISOString(),
        error: {
          message: "Test error",
          issues: [],
          configPath: "/test/path",
        },
      };

      setConfigStatus(testStatus);
      const retrieved = getConfigStatus();

      expect(retrieved.status).toBe("invalid");
      expect(retrieved.error?.message).toBe("Test error");
    });

    it("returns default status when file is corrupted", () => {
      const statusPath = resolveConfigStatusPath();
      fs.writeFileSync(statusPath, "invalid json {", "utf-8");

      const status = getConfigStatus();
      expect(status.status).toBe("valid");
    });
  });

  describe("setConfigStatus", () => {
    it("writes status to file", () => {
      const testStatus: ConfigErrorStatus = {
        status: "valid",
        timestamp: new Date().toISOString(),
        lastValidHash: "abc123",
      };

      setConfigStatus(testStatus);
      const statusPath = resolveConfigStatusPath();
      const raw = fs.readFileSync(statusPath, "utf-8");
      const retrieved = JSON.parse(raw);

      expect(retrieved.status).toBe("valid");
      expect(retrieved.lastValidHash).toBe("abc123");
    });

    it("creates state directory if it doesn't exist", () => {
      const newTempDir = path.join(tempDir, "new-state");
      process.env.OPENCLAW_STATE_DIR = newTempDir;

      const testStatus: ConfigErrorStatus = {
        status: "valid",
        timestamp: new Date().toISOString(),
      };

      setConfigStatus(testStatus);

      expect(fs.existsSync(newTempDir)).toBe(true);
      expect(fs.existsSync(path.join(newTempDir, "config-status.json"))).toBe(true);
    });
  });

  describe("markConfigValid", () => {
    it("sets status to valid with hash and backup path", () => {
      markConfigValid({
        hash: "test-hash",
        backupPath: "/test/backup",
      });

      const status = getConfigStatus();
      expect(status.status).toBe("valid");
      expect(status.lastValidHash).toBe("test-hash");
      expect(status.lastValidBackupPath).toBe("/test/backup");
    });

    it("preserves existing hash if not provided", () => {
      markConfigValid({ hash: "original-hash" });
      markConfigValid({});

      const status = getConfigStatus();
      expect(status.lastValidHash).toBe("original-hash");
    });
  });

  describe("markConfigInvalid", () => {
    it("sets status to invalid with error details", () => {
      markConfigInvalid({
        message: "Validation failed",
        issues: [
          { path: "test.path", message: "Invalid value" },
        ],
        configPath: "/test/config.json",
        invalidConfigPath: "/test/config.json.error-2026-04-03",
      });

      const status = getConfigStatus();
      expect(status.status).toBe("invalid");
      expect(status.error?.message).toBe("Validation failed");
      expect(status.error?.issues).toHaveLength(1);
      expect(status.error?.configPath).toBe("/test/config.json");
      expect(status.error?.invalidConfigPath).toBe("/test/config.json.error-2026-04-03");
    });
  });

  describe("markConfigRollingBack", () => {
    it("sets status to rolling_back with reason", () => {
      markConfigRollingBack("Invalid configuration detected");

      const status = getConfigStatus();
      expect(status.status).toBe("rolling_back");
      expect(status.rollback?.reason).toBe("Invalid configuration detected");
      expect(status.rollback?.startedAt).toBeDefined();
    });
  });

  describe("wasLastConfigInvalid", () => {
    it("returns true when last status was invalid", () => {
      markConfigInvalid({
        message: "Test",
        issues: [],
        configPath: "/test",
      });

      expect(wasLastConfigInvalid()).toBe(true);
    });

    it("returns false when status is valid", () => {
      markConfigValid();

      expect(wasLastConfigInvalid()).toBe(false);
    });

    it("returns false when status is rolling_back", () => {
      markConfigRollingBack("Test");

      expect(wasLastConfigInvalid()).toBe(false);
    });
  });

  describe("clearConfigStatus", () => {
    it("resets status to valid", () => {
      markConfigInvalid({
        message: "Test",
        issues: [],
        configPath: "/test",
      });

      clearConfigStatus();

      const status = getConfigStatus();
      expect(status.status).toBe("valid");
      expect(status.error).toBeUndefined();
    });
  });
});
