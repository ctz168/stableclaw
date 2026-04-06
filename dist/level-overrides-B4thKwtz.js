import { f as normalizeVerboseLevel } from "./thinking.shared-D6IkoLJU.js";
import "./thinking-Dga2zdtd.js";
//#region src/sessions/level-overrides.ts
function parseVerboseOverride(raw) {
	if (raw === null) return {
		ok: true,
		value: null
	};
	if (raw === void 0) return {
		ok: true,
		value: void 0
	};
	if (typeof raw !== "string") return {
		ok: false,
		error: "invalid verboseLevel (use \"on\"|\"off\")"
	};
	const normalized = normalizeVerboseLevel(raw);
	if (!normalized) return {
		ok: false,
		error: "invalid verboseLevel (use \"on\"|\"off\")"
	};
	return {
		ok: true,
		value: normalized
	};
}
function applyVerboseOverride(entry, level) {
	if (level === void 0) return;
	if (level === null) {
		delete entry.verboseLevel;
		return;
	}
	entry.verboseLevel = level;
}
//#endregion
export { parseVerboseOverride as n, applyVerboseOverride as t };
