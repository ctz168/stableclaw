//#region src/compat/legacy-names.ts
const PROJECT_NAME = "stableclaw";
const LEGACY_PROJECT_NAMES = ["openclaw"];
const MANIFEST_KEY = PROJECT_NAME;
const LEGACY_MANIFEST_KEYS = LEGACY_PROJECT_NAMES;
/** All manifest keys checked in order: current first, then legacy. */
const ALL_MANIFEST_KEYS = [MANIFEST_KEY, ...LEGACY_MANIFEST_KEYS];
//#endregion
export { LEGACY_MANIFEST_KEYS as n, MANIFEST_KEY as r, ALL_MANIFEST_KEYS as t };
