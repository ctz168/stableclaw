/**
 * Lightweight Plugin Manifest Reader
 *
 * Reads `openclaw.plugin.json` metadata without importing any plugin
 * JavaScript code.  This is the fast path used by the lazy gateway boot
 * sequence to discover which plugins exist and what capabilities they
 * advertise, without paying the cost of loading their runtime modules.
 *
 * @module plugins/manifest-reader
 */

import fs from "node:fs";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import { normalizePluginsConfig } from "./config-state.js";
import { discoverOpenClawPlugins } from "./discovery.js";
import {
  loadPluginManifest,
  type PluginManifest,
  type PluginManifestContracts,
} from "./manifest.js";
import { loadBundleManifest } from "./bundle-manifest.js";

// ── Public types ────────────────────────────────────────────────────

/**
 * Lightweight manifest snapshot for lazy discovery.
 * Intentionally a subset of the full `PluginManifestRecord` to keep the
 * fast-path parsing lean.
 */
export type LazyPluginManifest = {
  /** Canonical plugin id from the manifest. */
  id: string;
  /** Human-readable display name (falls back to id). */
  name: string;
  /** Semver version string if declared. */
  version?: string;
  /** Plugin origin (bundled / global / workspace / config). */
  origin: string;
  /** Plugin format (openclaw / bundle). */
  format?: string;
  /** Root directory of the plugin on disk. */
  rootDir: string;
  /** Primary source file path. */
  source: string;
  /** Optional setup entry for channel plugins. */
  setupSource?: string;
  /** Channels this plugin serves (e.g. telegram, discord). */
  channels: string[];
  /** Provider ids this plugin registers. */
  providers: string[];
  /** Skill ids. */
  skills: string[];
  /** CLI backend ids. */
  cliBackends: string[];
  /** Contract-level capabilities. */
  contracts?: PluginManifestContracts;
  /** Whether the plugin should be enabled by default. */
  enabledByDefault?: boolean;
  /** Provider ids whose configuration auto-enables this plugin. */
  autoEnableWhenConfiguredProviders?: string[];
  /** Whether the plugin's channel can defer full load until after listen. */
  startupDeferConfiguredChannelFullLoadUntilAfterListen?: boolean;
  /** Manifest file path. */
  manifestPath: string;
};

// ── Implementation ──────────────────────────────────────────────────

/**
 * Read a single plugin manifest from a directory.
 *
 * Only reads the `openclaw.plugin.json` (or bundle manifest) and returns
 * a lightweight summary.  No JavaScript is imported.
 *
 * @param pluginDir - Absolute path to the plugin root directory.
 * @returns A `LazyPluginManifest` if a valid manifest was found, or `null`.
 */
export function readPluginManifest(pluginDir: string): LazyPluginManifest | null {
  const manifestResult = loadPluginManifest(pluginDir, /* rejectHardlinks */ false);
  if (!manifestResult.ok) {
    return null;
  }
  const m = manifestResult.manifest;
  return {
    id: m.id,
    name: m.name ?? m.id,
    version: m.version,
    origin: "unknown",
    rootDir: pluginDir,
    source: pluginDir,
    channels: m.channels ?? [],
    providers: m.providers ?? [],
    skills: m.skills ?? [],
    cliBackends: m.cliBackends ?? [],
    contracts: m.contracts,
    enabledByDefault: m.enabledByDefault,
    autoEnableWhenConfiguredProviders: m.autoEnableWhenConfiguredProviders,
    manifestPath: manifestResult.manifestPath,
  };
}

/**
 * Scan all plugin directories and return lightweight manifests.
 *
 * This function reuses the existing `discoverOpenClawPlugins` for filesystem
 * discovery (which is cached), then only parses the JSON manifests without
 * importing any JavaScript modules.
 *
 * @returns An array of `LazyPluginManifest` entries.
 */
export async function scanPluginManifests(params: {
  config: OpenClawConfig;
  workspaceDir: string;
}): Promise<LazyPluginManifest[]> {
  const normalized = normalizePluginsConfig(params.config.plugins);
  const discovery = discoverOpenClawPlugins({
    workspaceDir: params.workspaceDir,
    extraPaths: normalized.loadPaths,
    cache: true,
  });

  const manifests: LazyPluginManifest[] = [];

  for (const candidate of discovery.candidates) {
    const rejectHardlinks = candidate.origin !== "bundled";
    const isBundle = (candidate.format ?? "openclaw") === "bundle";

    if (isBundle && candidate.bundleFormat) {
      const bundleResult = loadBundleManifest({
        rootDir: candidate.rootDir,
        bundleFormat: candidate.bundleFormat,
        rejectHardlinks,
      });
      if (!bundleResult.ok) {
        continue;
      }
      manifests.push({
        id: bundleResult.manifest.id,
        name: bundleResult.manifest.name ?? candidate.idHint,
        version: bundleResult.manifest.version,
        origin: candidate.origin,
        format: "bundle",
        rootDir: candidate.rootDir,
        source: candidate.source,
        setupSource: candidate.setupSource,
        channels: [],
        providers: [],
        skills: bundleResult.manifest.skills ?? [],
        cliBackends: [],
        manifestPath: bundleResult.manifestPath,
      });
      continue;
    }

    const manifestResult =
      candidate.origin === "bundled" && candidate.bundledManifest && candidate.bundledManifestPath
        ? {
            ok: true as const,
            manifest: candidate.bundledManifest,
            manifestPath: candidate.bundledManifestPath,
          }
        : loadPluginManifest(candidate.rootDir, rejectHardlinks);

    if (!manifestResult.ok) {
      continue;
    }

    const m = manifestResult.manifest as PluginManifest;
    manifests.push({
      id: m.id,
      name: m.name ?? candidate.packageName ?? candidate.idHint,
      version: m.version ?? candidate.packageVersion,
      origin: candidate.origin,
      format: candidate.format ?? "openclaw",
      rootDir: candidate.rootDir,
      source: candidate.source,
      setupSource: candidate.setupSource,
      channels: m.channels ?? [],
      providers: m.providers ?? [],
      skills: m.skills ?? [],
      cliBackends: m.cliBackends ?? [],
      contracts: m.contracts,
      enabledByDefault: m.enabledByDefault === true ? true : undefined,
      autoEnableWhenConfiguredProviders: m.autoEnableWhenConfiguredProviders,
      startupDeferConfiguredChannelFullLoadUntilAfterListen:
        candidate.packageManifest?.startup?.deferConfiguredChannelFullLoadUntilAfterListen === true,
      manifestPath: manifestResult.manifestPath,
    });
  }

  return manifests;
}

/**
 * List all available plugin IDs (without loading them).
 *
 * Convenience wrapper around {@link scanPluginManifests} that returns only
 * the plugin IDs.
 */
export async function listAvailablePluginIds(params: {
  config: OpenClawConfig;
  workspaceDir: string;
}): Promise<string[]> {
  const manifests = await scanPluginManifests(params);
  return manifests.map((m) => m.id);
}
