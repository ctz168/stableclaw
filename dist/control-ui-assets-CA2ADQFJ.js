import { n as defaultRuntime } from "./runtime-kS8e4c6-.js";
import { r as runCommandWithTimeout } from "./exec-BO6vYjRf.js";
import { n as resolveOpenClawPackageRootSync, t as resolveOpenClawPackageRoot } from "./openclaw-root-F1SOdmJ0.js";
import { fileURLToPath } from "node:url";
import fsSync from "node:fs";
import path from "node:path";
//#region src/infra/control-ui-assets.ts
const CONTROL_UI_DIST_PATH_SEGMENTS = [
	"dist",
	"control-ui",
	"index.html"
];
function resolveControlUiDistIndexPathForRoot(root) {
	return path.join(root, ...CONTROL_UI_DIST_PATH_SEGMENTS);
}
async function resolveControlUiDistIndexHealth(opts = {}) {
	const indexPath = opts.root ? resolveControlUiDistIndexPathForRoot(opts.root) : await resolveControlUiDistIndexPath({
		argv1: opts.argv1 ?? process.argv[1],
		moduleUrl: opts.moduleUrl
	});
	return {
		indexPath,
		exists: Boolean(indexPath && fsSync.existsSync(indexPath))
	};
}
function resolveControlUiRepoRoot(argv1 = process.argv[1]) {
	if (!argv1) return null;
	const normalized = path.resolve(argv1);
	const parts = normalized.split(path.sep);
	const srcIndex = parts.lastIndexOf("src");
	if (srcIndex !== -1) {
		const root = parts.slice(0, srcIndex).join(path.sep);
		if (fsSync.existsSync(path.join(root, "ui", "vite.config.ts"))) return root;
	}
	let dir = path.dirname(normalized);
	for (let i = 0; i < 8; i++) {
		if (fsSync.existsSync(path.join(dir, "package.json")) && fsSync.existsSync(path.join(dir, "ui", "vite.config.ts"))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}
async function resolveControlUiDistIndexPath(argv1OrOpts) {
	const argv1 = typeof argv1OrOpts === "string" ? argv1OrOpts : argv1OrOpts?.argv1 ?? process.argv[1];
	const moduleUrl = typeof argv1OrOpts === "object" ? argv1OrOpts?.moduleUrl : void 0;
	if (!argv1) return null;
	const normalized = path.resolve(argv1);
	const entrypointCandidates = [normalized];
	try {
		const realpathEntrypoint = fsSync.realpathSync(normalized);
		if (realpathEntrypoint !== normalized) entrypointCandidates.push(realpathEntrypoint);
	} catch {}
	for (const entrypoint of entrypointCandidates) {
		const distDir = path.dirname(entrypoint);
		if (path.basename(distDir) === "dist") return path.join(distDir, "control-ui", "index.html");
	}
	const packageRoot = await resolveOpenClawPackageRoot({
		argv1: normalized,
		moduleUrl
	});
	if (packageRoot) return path.join(packageRoot, "dist", "control-ui", "index.html");
	const fallbackStartDirs = new Set(entrypointCandidates.map((candidate) => path.dirname(candidate)));
	for (const startDir of fallbackStartDirs) {
		let dir = startDir;
		for (let i = 0; i < 8; i++) {
			const pkgJsonPath = path.join(dir, "package.json");
			const indexPath = path.join(dir, "dist", "control-ui", "index.html");
			if (fsSync.existsSync(pkgJsonPath)) try {
				const raw = fsSync.readFileSync(pkgJsonPath, "utf-8");
				if (JSON.parse(raw).name === "openclaw") return fsSync.existsSync(indexPath) ? indexPath : null;
				break;
			} catch {
				break;
			}
			const parent = path.dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	}
	return null;
}
function pathsMatchByRealpathOrResolve(left, right) {
	let realLeft;
	let realRight;
	try {
		realLeft = fsSync.realpathSync(left);
	} catch {
		realLeft = path.resolve(left);
	}
	try {
		realRight = fsSync.realpathSync(right);
	} catch {
		realRight = path.resolve(right);
	}
	return realLeft === realRight;
}
function addCandidate(candidates, value) {
	if (!value) return;
	candidates.add(path.resolve(value));
}
function resolveControlUiRootOverrideSync(rootOverride) {
	const resolved = path.resolve(rootOverride);
	try {
		const stats = fsSync.statSync(resolved);
		if (stats.isFile()) return path.basename(resolved) === "index.html" ? path.dirname(resolved) : null;
		if (stats.isDirectory()) {
			const indexPath = path.join(resolved, "index.html");
			return fsSync.existsSync(indexPath) ? resolved : null;
		}
	} catch {
		return null;
	}
	return null;
}
function resolveControlUiRootSync(opts = {}) {
	const candidates = /* @__PURE__ */ new Set();
	const argv1 = opts.argv1 ?? process.argv[1];
	const cwd = opts.cwd ?? process.cwd();
	const moduleDir = opts.moduleUrl ? path.dirname(fileURLToPath(opts.moduleUrl)) : null;
	const argv1Dir = argv1 ? path.dirname(path.resolve(argv1)) : null;
	const argv1RealpathDir = (() => {
		if (!argv1) return null;
		try {
			return path.dirname(fsSync.realpathSync(path.resolve(argv1)));
		} catch {
			return null;
		}
	})();
	const execDir = (() => {
		try {
			const execPath = opts.execPath ?? process.execPath;
			return path.dirname(fsSync.realpathSync(execPath));
		} catch {
			return null;
		}
	})();
	const packageRoot = resolveOpenClawPackageRootSync({
		argv1,
		moduleUrl: opts.moduleUrl,
		cwd
	});
	addCandidate(candidates, execDir ? path.join(execDir, "../Resources/control-ui") : null);
	addCandidate(candidates, execDir ? path.join(execDir, "control-ui") : null);
	if (moduleDir) {
		addCandidate(candidates, path.join(moduleDir, "control-ui"));
		addCandidate(candidates, path.join(moduleDir, "../control-ui"));
		addCandidate(candidates, path.join(moduleDir, "../../dist/control-ui"));
	}
	if (argv1Dir) {
		addCandidate(candidates, path.join(argv1Dir, "dist", "control-ui"));
		addCandidate(candidates, path.join(argv1Dir, "control-ui"));
	}
	if (argv1RealpathDir && argv1RealpathDir !== argv1Dir) {
		addCandidate(candidates, path.join(argv1RealpathDir, "dist", "control-ui"));
		addCandidate(candidates, path.join(argv1RealpathDir, "control-ui"));
	}
	if (packageRoot) addCandidate(candidates, path.join(packageRoot, "dist", "control-ui"));
	addCandidate(candidates, path.join(cwd, "dist", "control-ui"));
	for (const dir of candidates) {
		const indexPath = path.join(dir, "index.html");
		if (fsSync.existsSync(indexPath)) return dir;
	}
	return null;
}
function isPackageProvenControlUiRootSync(root, opts = {}) {
	const argv1 = opts.argv1 ?? process.argv[1];
	const cwd = opts.cwd ?? process.cwd();
	const packageRoot = resolveOpenClawPackageRootSync({
		argv1,
		moduleUrl: opts.moduleUrl,
		cwd
	});
	if (!packageRoot) return false;
	return pathsMatchByRealpathOrResolve(root, path.join(packageRoot, "dist", "control-ui"));
}
function summarizeCommandOutput(text) {
	const lines = text.split(/\r?\n/g).map((l) => l.trim()).filter(Boolean);
	if (!lines.length) return;
	const last = lines.at(-1);
	if (!last) return;
	return last.length > 240 ? `${last.slice(0, 239)}…` : last;
}
async function ensureControlUiAssetsBuilt(runtime = defaultRuntime, opts) {
	const health = await resolveControlUiDistIndexHealth({ argv1: process.argv[1] });
	health.indexPath;
	if (health.exists) return {
		ok: true,
		built: false
	};
	const repoRoot = resolveControlUiRepoRoot(process.argv[1]);
	if (!repoRoot) return {
		ok: true,
		built: false
	};
	const indexPath = resolveControlUiDistIndexPathForRoot(repoRoot);
	if (fsSync.existsSync(indexPath)) return {
		ok: true,
		built: false
	};
	const uiScript = path.join(repoRoot, "scripts", "ui.js");
	if (!fsSync.existsSync(uiScript)) return {
		ok: true,
		built: false
	};
	runtime.log("Control UI assets missing; auto-building (ui:build, auto-installs UI deps)…");
	const timeoutMs = opts?.timeoutMs ?? 3 * 6e4;
	const build = await runCommandWithTimeout([
		process.execPath,
		uiScript,
		"build"
	], {
		cwd: repoRoot,
		timeoutMs
	});
	if (build.code !== 0) {
		const errorSummary = summarizeCommandOutput(build.stderr) ?? `exit ${build.code}`;
		runtime.log(`Control UI build failed: ${errorSummary}. Continuing without Control UI.`);
		return {
			ok: false,
			built: false,
			message: `Control UI build failed: ${errorSummary}`
		};
	}
	if (!fsSync.existsSync(indexPath)) {
		runtime.log(`Control UI build succeeded but ${indexPath} is missing. Continuing without Control UI.`);
		return {
			ok: false,
			built: true,
			message: `Control UI build succeeded but output not found`
		};
	}
	runtime.log("Control UI build completed successfully.");
	return {
		ok: true,
		built: true
	};
}
//#endregion
export { resolveControlUiRootOverrideSync as a, resolveControlUiDistIndexPathForRoot as i, isPackageProvenControlUiRootSync as n, resolveControlUiRootSync as o, resolveControlUiDistIndexHealth as r, ensureControlUiAssetsBuilt as t };
