//#region src/daemon/constants.ts
const GATEWAY_LAUNCH_AGENT_LABEL = "ai.stableclaw.gateway";
const GATEWAY_SYSTEMD_SERVICE_NAME = "stableclaw-gateway";
const GATEWAY_WINDOWS_TASK_NAME = "StableClaw Gateway";
const GATEWAY_SERVICE_MARKER = "stableclaw";
const GATEWAY_SERVICE_KIND = "gateway";
const NODE_LAUNCH_AGENT_LABEL = "ai.stableclaw.node";
const NODE_SYSTEMD_SERVICE_NAME = "stableclaw-node";
const NODE_WINDOWS_TASK_NAME = "StableClaw Node";
const NODE_SERVICE_MARKER = "stableclaw";
const NODE_SERVICE_KIND = "node";
const NODE_WINDOWS_TASK_SCRIPT_NAME = "node.cmd";
const LEGACY_GATEWAY_SYSTEMD_SERVICE_NAMES = ["clawdbot-gateway", "openclaw-gateway"];
function normalizeGatewayProfile(profile) {
	const trimmed = profile?.trim();
	if (!trimmed || trimmed.toLowerCase() === "default") return null;
	return trimmed;
}
function resolveGatewayProfileSuffix(profile) {
	const normalized = normalizeGatewayProfile(profile);
	return normalized ? `-${normalized}` : "";
}
function resolveGatewayLaunchAgentLabel(profile) {
	const normalized = normalizeGatewayProfile(profile);
	if (!normalized) return GATEWAY_LAUNCH_AGENT_LABEL;
	return `ai.stableclaw.${normalized}`;
}
function resolveLegacyGatewayLaunchAgentLabels(profile) {
	return [];
}
function resolveGatewaySystemdServiceName(profile) {
	const suffix = resolveGatewayProfileSuffix(profile);
	if (!suffix) return GATEWAY_SYSTEMD_SERVICE_NAME;
	return `stableclaw-gateway${suffix}`;
}
function resolveGatewayWindowsTaskName(profile) {
	const normalized = normalizeGatewayProfile(profile);
	if (!normalized) return GATEWAY_WINDOWS_TASK_NAME;
	return `StableClaw Gateway (${normalized})`;
}
function formatGatewayServiceDescription(params) {
	const profile = normalizeGatewayProfile(params?.profile);
	const version = params?.version?.trim();
	const parts = [];
	if (profile) parts.push(`profile: ${profile}`);
	if (version) parts.push(`v${version}`);
	if (parts.length === 0) return "StableClaw Gateway";
	return `StableClaw Gateway (${parts.join(", ")})`;
}
function resolveGatewayServiceDescription(params) {
	return params.description ?? formatGatewayServiceDescription({
		profile: params.env.STABLECLAW_PROFILE || params.env.OPENCLAW_PROFILE,
		version: params.environment?.STABLECLAW_SERVICE_VERSION ?? params.env.STABLECLAW_SERVICE_VERSION ?? params.environment?.OPENCLAW_SERVICE_VERSION ?? params.env.OPENCLAW_SERVICE_VERSION
	});
}
function resolveNodeLaunchAgentLabel() {
	return NODE_LAUNCH_AGENT_LABEL;
}
function resolveNodeSystemdServiceName() {
	return NODE_SYSTEMD_SERVICE_NAME;
}
function resolveNodeWindowsTaskName() {
	return NODE_WINDOWS_TASK_NAME;
}
function formatNodeServiceDescription(params) {
	const version = params?.version?.trim();
	if (!version) return "StableClaw Node Host";
	return `StableClaw Node Host (v${version})`;
}
//#endregion
export { resolveNodeWindowsTaskName as _, NODE_SERVICE_KIND as a, formatNodeServiceDescription as c, resolveGatewayServiceDescription as d, resolveGatewaySystemdServiceName as f, resolveNodeSystemdServiceName as g, resolveNodeLaunchAgentLabel as h, LEGACY_GATEWAY_SYSTEMD_SERVICE_NAMES as i, resolveGatewayLaunchAgentLabel as l, resolveLegacyGatewayLaunchAgentLabels as m, GATEWAY_SERVICE_KIND as n, NODE_SERVICE_MARKER as o, resolveGatewayWindowsTaskName as p, GATEWAY_SERVICE_MARKER as r, NODE_WINDOWS_TASK_SCRIPT_NAME as s, GATEWAY_LAUNCH_AGENT_LABEL as t, resolveGatewayProfileSuffix as u };
