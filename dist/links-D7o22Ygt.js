import { D as formatTerminalLink } from "./utils-CN_F_3Qg.js";
//#region src/terminal/links.ts
function resolveDocsRoot() {
	return "https://docs.stableclaw.ai";
}
resolveDocsRoot();
function formatDocsLink(path, label, opts) {
	const trimmed = path.trim();
	const docsRoot = resolveDocsRoot();
	const url = trimmed.startsWith("http") ? trimmed : `${docsRoot}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
	return formatTerminalLink(label ?? url, url, {
		fallback: opts?.fallback ?? url,
		force: opts?.force
	});
}
//#endregion
export { formatDocsLink as t };
