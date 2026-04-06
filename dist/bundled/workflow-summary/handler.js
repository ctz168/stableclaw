import { t as createSubsystemLogger } from "../../subsystem-C9VSlEcV.js";
import { _ as resolveStateDir } from "../../paths-GWMNxnBn.js";
import { c as resolveAgentIdByWorkspacePath, p as resolveAgentWorkspaceDir } from "../../agent-scope-rWWUivuC.js";
import { a as resolveWorkflowSummaryConfig, n as cleanupOldWorkflowSummaries, t as appendWorkflowSummaryEntry } from "../../workflow-summary-BvKmY9PS.js";
import path from "node:path";
import os from "node:os";
//#region src/hooks/bundled/workflow-summary/handler.ts
/**
* Workflow Summary Hook Handler
*
* Listens for agent:end internal hook events and generates a structured
* workflow summary from the session context. Persists the summary to
* memory/workflow-summaries/ for later context injection during compaction.
*
* The hook uses data available in the agent:end event context:
* - assistantTexts: accumulated assistant text outputs
* - toolMetas: tool call metadata (name, description)
* - isError / error: whether the run ended with an error
*/
const log = createSubsystemLogger("hooks/workflow-summary");
/**
* Extract a structured workflow summary from the agent:end event context.
*/
function extractSummaryFromEndContext(params) {
	const { context, timestamp } = params;
	const outcomes = [];
	const decisions = [];
	const pending = [];
	const importantContext = [];
	const toolMetas = context.toolMetas ?? [];
	for (const tm of toolMetas) {
		const name = tm.toolName ?? "unknown";
		const meta = tm.meta;
		if (meta && meta.length > 0) outcomes.push(`${name}: ${meta.slice(0, 80)}`);
		else outcomes.push(`used ${name}`);
	}
	const fullAssistantText = (context.assistantTexts ?? []).join("\n");
	if (fullAssistantText.length > 0) {
		const editMatches = fullAssistantText.matchAll(/(?:edited|modified|created|updated|wrote|deleted|重写|修改|创建|更新)\s+[`'"]?([^`'"\n]{3,80})[`'"]?/gi);
		for (const match of editMatches) if (!outcomes.some((o) => o.includes(match[1]))) outcomes.push(match[1]);
		const commitMatches = fullAssistantText.matchAll(/([a-f0-9]{7,12})/g);
		for (const match of commitMatches) if (!outcomes.includes(`commit ${match[1]}`)) outcomes.push(`commit ${match[1]}`);
		const todoMatches = fullAssistantText.matchAll(/(?:TODO|pending|待办|待处理|需要.*?完成)[:\s]*(.{5,80}?)(?:\n|$)/gi);
		for (const match of todoMatches) {
			const item = match[1].trim();
			if (item.length > 2 && pending.length < 20 && !pending.includes(item)) pending.push(item);
		}
	}
	const runId = typeof context.runId === "string" ? context.runId : "";
	const isError = context.isError === true;
	const error = typeof context.error === "string" ? context.error : void 0;
	let taskLabel = isError ? `run ${runId.slice(0, 8)} (failed: ${error?.slice(0, 50) ?? "unknown"})` : `run ${runId.slice(0, 8)}`;
	if (error && error.length > 0) importantContext.push(`Last error: ${error.slice(0, 200)}`);
	return {
		timestamp: timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
		taskLabel: taskLabel.slice(0, 100),
		outcomes: outcomes.slice(0, 15),
		decisions: decisions.slice(0, 10),
		pending: pending.slice(0, 20),
		importantContext: importantContext.slice(0, 10)
	};
}
/**
* Main hook handler for agent:end events.
*/
const handleWorkflowSummary = async (event) => {
	if (event.type !== "agent" || event.action !== "end") return;
	try {
		log.debug("Workflow summary hook triggered", { sessionKey: event.sessionKey });
		const context = event.context ?? {};
		const cfg = context.cfg;
		const workspaceDir = typeof context.workspaceDir === "string" && context.workspaceDir.trim().length > 0 ? context.workspaceDir : void 0;
		const wfConfig = resolveWorkflowSummaryConfig(cfg, workspaceDir ?? (cfg ? resolveAgentWorkspaceDir(cfg, resolveAgentIdByWorkspacePath(cfg, workspaceDir ?? "") ?? "") : path.join(resolveStateDir(process.env, () => os.homedir()), "workspace")));
		if (!wfConfig.enabled) {
			log.debug("Workflow summary disabled, skipping");
			return;
		}
		const toolMetas = context.toolMetas ?? [];
		const assistantTexts = context.assistantTexts ?? [];
		if (!(toolMetas.length > 0 || assistantTexts.some((text) => text.length > 100))) {
			log.debug("No substantial work to summarize");
			return;
		}
		const entry = extractSummaryFromEndContext({
			context,
			timestamp: event.timestamp?.toISOString()
		});
		if (entry.outcomes.length === 0 && entry.pending.length === 0 && entry.importantContext.length === 0) {
			log.debug("No meaningful summary content extracted");
			return;
		}
		await appendWorkflowSummaryEntry({
			memoryDir: wfConfig.memoryDir,
			entry,
			sessionKey: event.sessionKey,
			sessionId: context.sessionId || void 0
		});
		if (Math.random() < .05) cleanupOldWorkflowSummaries(wfConfig.memoryDir, 7).catch(() => {});
		log.info("Workflow summary generated", {
			taskLabel: entry.taskLabel,
			outcomes: entry.outcomes.length,
			pending: entry.pending.length,
			sessionKey: event.sessionKey
		});
	} catch (err) {
		if (err instanceof Error) log.error("Failed to generate workflow summary", {
			errorName: err.name,
			errorMessage: err.message,
			stack: err.stack
		});
		else log.error("Failed to generate workflow summary", { error: String(err) });
	}
};
//#endregion
export { handleWorkflowSummary as default };
