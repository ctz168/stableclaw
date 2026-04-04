export const PROJECT_NAME = "stableclaw" as const;

export const LEGACY_PROJECT_NAMES = ["openclaw"] as const;

export const MANIFEST_KEY = PROJECT_NAME;

export const LEGACY_MANIFEST_KEYS = LEGACY_PROJECT_NAMES;

/** All manifest keys checked in order: current first, then legacy. */
export const ALL_MANIFEST_KEYS = [MANIFEST_KEY, ...LEGACY_MANIFEST_KEYS] as const;

export const LEGACY_PLUGIN_MANIFEST_FILENAMES = ["openclaw.plugin.json"] as const;

export const LEGACY_CANVAS_HANDLER_NAMES = [] as const;

export const MACOS_APP_SOURCES_DIR = "apps/macos/Sources/StableClaw" as const;

export const LEGACY_MACOS_APP_SOURCES_DIRS = ["apps/macos/Sources/OpenClaw"] as const;
