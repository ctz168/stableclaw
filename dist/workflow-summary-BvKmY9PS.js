import { t as createSubsystemLogger } from "./subsystem-C9VSlEcV.js";
import { _ as resolveStateDir } from "./paths-GWMNxnBn.js";
import { m as writeFileWithinRoot } from "./fs-safe-BQ59ttjX.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
//#region src/agents/workflow-summary.ts
/**
* Workflow Summary System
*
* After each agent task completion, generates a structured workflow summary
* and persists it to memory. When context grows long, the summary is loaded
* and injected into the prompt alongside recent messages, ensuring the agent
* retains critical context even after compaction.
*
* Design goals:
* - Proactive: summary generated after each task, not just on compaction
* - Structured: captures tasks, decisions, pending items, important context
* - Persistent: stored in memory/ directory, survives across sessions
* - Composable: used by compaction to improve context quality
*/
const log = createSubsystemLogger("workflow-summary");
const DEFAULT_RECENT_MESSAGE_COUNT = 15;
const MAX_SUMMARY_ENTRIES_PER_FILE = 50;
function resolveWorkflowSummaryConfig(cfg, workspaceDir) {
	const hooksConfig = cfg?.hooks?.internal?.entries?.["workflow-summary"];
	const enabled = hooksConfig?.enabled !== false;
	const recentMessageCount = typeof hooksConfig?.recentMessages === "number" && hooksConfig.recentMessages > 0 ? Math.min(hooksConfig.recentMessages, 50) : DEFAULT_RECENT_MESSAGE_COUNT;
	const defaultWorkspace = path.join(resolveStateDir(process.env, () => os.homedir()), "workspace");
	return {
		memoryDir: path.join(workspaceDir ?? defaultWorkspace, "memory", "workflow-summaries"),
		recentMessageCount,
		enabled
	};
}
function summaryFilename(date) {
	return `${date.toISOString().split("T")[0]}-summary-${date.toISOString().split("T")[1].split(".")[0].replace(/:/g, "").slice(0, 6)}.json`;
}
/**
* Load all workflow summaries for the current session, merged into one.
*/
async function loadMergedWorkflowSummary(memoryDir, sessionKey) {
	try {
		await fs.mkdir(memoryDir, { recursive: true });
		const jsonFiles = (await fs.readdir(memoryDir)).filter((f) => f.endsWith(".json")).sort().reverse();
		if (jsonFiles.length === 0) return null;
		const recentFiles = jsonFiles.slice(0, 3);
		const allEntries = [];
		for (const file of recentFiles) try {
			const content = await fs.readFile(path.join(memoryDir, file), "utf-8");
			const parsed = JSON.parse(content);
			if (sessionKey && parsed.sessionKey && parsed.sessionKey !== sessionKey) continue;
			allEntries.push(...parsed.entries ?? []);
		} catch {}
		if (allEntries.length === 0) return null;
		return formatWorkflowSummaryAsContext(allEntries);
	} catch {
		return null;
	}
}
async function appendWorkflowSummaryEntry(params) {
	const { memoryDir, entry, sessionKey, sessionId } = params;
	await fs.mkdir(memoryDir, { recursive: true });
	const filename = summaryFilename(new Date(entry.timestamp));
	const filePath = path.join(memoryDir, filename);
	let summaryFile;
	try {
		const content = await fs.readFile(filePath, "utf-8");
		summaryFile = JSON.parse(content);
		if (summaryFile.entries.length >= MAX_SUMMARY_ENTRIES_PER_FILE) {
			const newFilename = summaryFilename(/* @__PURE__ */ new Date());
			path.join(memoryDir, newFilename);
			summaryFile = {
				createdAt: (/* @__PURE__ */ new Date()).toISOString(),
				sessionKey,
				sessionId,
				entries: [entry]
			};
			await writeFileWithinRoot({
				rootDir: memoryDir,
				relativePath: newFilename,
				data: JSON.stringify(summaryFile, null, 2),
				encoding: "utf-8"
			});
			return;
		}
		summaryFile.entries.push(entry);
	} catch {
		summaryFile = {
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			sessionKey,
			sessionId,
			entries: [entry]
		};
	}
	await writeFileWithinRoot({
		rootDir: memoryDir,
		relativePath: filename,
		data: JSON.stringify(summaryFile, null, 2),
		encoding: "utf-8"
	});
	log.info(`Workflow summary saved: ${entry.taskLabel}`, {
		path: filePath.replace(os.homedir(), "~"),
		entryCount: summaryFile.entries.length
	});
}
/**
* Format workflow summary entries into a compact context block
* that can be injected into the system prompt or prependContext.
*/
function formatWorkflowSummaryAsContext(entries) {
	if (entries.length === 0) return "";
	const uniqueEntries = entries.slice(-20);
	const lines = [
		"<workflow-summary>",
		"The following is a summary of work completed in previous tasks in this session:",
		""
	];
	for (const entry of uniqueEntries) {
		lines.push(`## ${entry.taskLabel} (${entry.timestamp.split("T")[1]?.split(".")[0] ?? "unknown"})`);
		if (entry.outcomes.length > 0) {
			lines.push("**Completed:**");
			for (const outcome of entry.outcomes.slice(0, 5)) lines.push(`- ${outcome}`);
		}
		if (entry.decisions.length > 0) {
			lines.push("**Decisions:**");
			for (const decision of entry.decisions.slice(0, 5)) lines.push(`- ${decision}`);
		}
		if (entry.pending.length > 0) {
			lines.push("**Pending:**");
			for (const item of entry.pending.slice(0, 5)) lines.push(`- ${item}`);
		}
		if (entry.importantContext.length > 0) {
			lines.push("**Important:**");
			for (const ctx of entry.importantContext.slice(0, 3)) lines.push(`- ${ctx}`);
		}
		lines.push("");
	}
	lines.push("</workflow-summary>");
	return lines.join("\n");
}
/**
* Clean up old workflow summary files (keep last N days).
*/
async function cleanupOldWorkflowSummaries(memoryDir, maxAgeDays = 7) {
	try {
		await fs.mkdir(memoryDir, { recursive: true });
		const jsonFiles = (await fs.readdir(memoryDir)).filter((f) => f.endsWith(".json")).sort();
		const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1e3;
		let removed = 0;
		for (const file of jsonFiles) {
			const filePath = path.join(memoryDir, file);
			try {
				if ((await fs.stat(filePath)).mtimeMs < cutoff) {
					await fs.unlink(filePath);
					removed++;
				}
			} catch {}
		}
		if (removed > 0) log.info(`Cleaned up ${removed} old workflow summary files`);
		return removed;
	} catch {
		return 0;
	}
}
//#endregion
export { resolveWorkflowSummaryConfig as a, loadMergedWorkflowSummary as i, cleanupOldWorkflowSummaries as n, formatWorkflowSummaryAsContext as r, appendWorkflowSummaryEntry as t };
