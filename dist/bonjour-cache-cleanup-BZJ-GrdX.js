import { a as logWarn, t as logDebug } from "./logger-DdGvppaE.js";
//#region src/infra/bonjour-cache-cleanup.ts
/**
* Bonjour/mDNS cache cleanup utilities.
* Helps clear mDNS cache entries to avoid name conflicts on restart.
*/
function detectPlatform() {
	const platform = process.platform;
	if (platform === "win32" || platform === "darwin" || platform === "linux") return platform;
	return "other";
}
/**
* Clear mDNS/DNS cache to remove stale service entries.
* This helps prevent "name conflict" warnings on gateway restart.
*/
async function clearMdnsCache() {
	const platform = detectPlatform();
	try {
		switch (platform) {
			case "win32":
				await clearWindowsMdnsCache();
				break;
			case "darwin":
				await clearMacosMdnsCache();
				break;
			case "linux":
				await clearLinuxMdnsCache();
				break;
			default: logDebug(`bonjour-cleanup: platform ${platform} does not require explicit mDNS cache cleanup`);
		}
	} catch (err) {
		logWarn(`bonjour-cleanup: failed to clear mDNS cache: ${String(err)}`);
	}
}
/**
* Windows: Flush DNS cache which includes mDNS entries.
* Uses `ipconfig /flushdns` to clear the DNS resolver cache.
*/
async function clearWindowsMdnsCache() {
	const { spawn } = await import("node:child_process");
	return new Promise((resolve) => {
		const proc = spawn("ipconfig", ["/flushdns"], {
			stdio: "ignore",
			shell: false
		});
		proc.on("close", (code) => {
			if (code === 0) logDebug("bonjour-cleanup: Windows DNS cache flushed (includes mDNS)");
			else logDebug(`bonjour-cleanup: ipconfig /flushdns exited with code ${code}`);
			resolve();
		});
		proc.on("error", (err) => {
			logDebug(`bonjour-cleanup: ipconfig /flushdns failed: ${String(err)}`);
			resolve();
		});
	});
}
/**
* macOS: Restart mDNSResponder to clear mDNS cache.
* Uses `sudo` if available, otherwise attempts without it.
*/
async function clearMacosMdnsCache() {
	const { spawn } = await import("node:child_process");
	await new Promise((resolve) => {
		const proc = spawn("dscacheutil", ["-flushcache"], {
			stdio: "ignore",
			shell: false
		});
		proc.on("close", () => resolve());
		proc.on("error", () => resolve());
	});
	await new Promise((resolve) => {
		const proc = spawn("sudo", [
			"killall",
			"-HUP",
			"mDNSResponder"
		], {
			stdio: "ignore",
			shell: false
		});
		proc.on("close", (code) => {
			if (code === 0) logDebug("bonjour-cleanup: macOS mDNSResponder restarted");
			else logDebug(`bonjour-cleanup: mDNSResponder restart exited with code ${code}`);
			resolve();
		});
		proc.on("error", (err) => {
			logDebug(`bonjour-cleanup: mDNSResponder restart failed: ${String(err)}`);
			resolve();
		});
	});
}
/**
* Linux: Restart avahi-daemon to clear mDNS cache.
* Requires systemd and avahi-daemon service.
*/
async function clearLinuxMdnsCache() {
	const { spawn } = await import("node:child_process");
	await new Promise((resolve) => {
		const proc = spawn("sudo", ["systemd-resolve", "--flush-caches"], {
			stdio: "ignore",
			shell: false
		});
		proc.on("close", () => resolve());
		proc.on("error", () => resolve());
	});
	await new Promise((resolve) => {
		const proc = spawn("sudo", [
			"systemctl",
			"restart",
			"avahi-daemon"
		], {
			stdio: "ignore",
			shell: false
		});
		proc.on("close", (code) => {
			if (code === 0) logDebug("bonjour-cleanup: Linux avahi-daemon restarted");
			else logDebug(`bonjour-cleanup: avahi-daemon restart exited with code ${code}`);
			resolve();
		});
		proc.on("error", (err) => {
			logDebug(`bonjour-cleanup: avahi-daemon restart failed: ${String(err)}`);
			resolve();
		});
	});
}
//#endregion
export { clearMdnsCache as t };
