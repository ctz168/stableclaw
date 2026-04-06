import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-DAt--D9n.js";
import { S as resolveThinkingDefault } from "./model-selection-w1RJdjfl.js";
import { a as resolveAgentDir, p as resolveAgentWorkspaceDir } from "./agent-scope-rWWUivuC.js";
import { d as ensureAgentWorkspace } from "./workspace-D5P9nuJd.js";
import { i as loadSessionStore, l as saveSessionStore } from "./store-B1hpZkjb.js";
import "./sessions-DukJH1Gz.js";
import { l as resolveStorePath, r as resolveSessionFilePath } from "./paths-xpks599B.js";
import { n as resolveAgentIdentity } from "./identity-DvwF6Yix.js";
import { Bn as getAllPendingRecoveryRequests, Gn as setRecoveryHandler, Hn as onSubagentFailure, Kn as submitRecoveryInput, Ln as clearPendingRecoveryRequest, Rn as createSubagentProgressTracker, Un as onSubagentProgress, Vn as getPendingRecoveryRequest, Wn as onSubagentRunProgress, t as runEmbeddedPiAgent, zn as emitSubagentFailureRecovery } from "./pi-embedded-B8eJYvw3.js";
import { n as resolveAgentTimeoutMs } from "./content-blocks-kAsQDkQT.js";
//#region src/extensionAPI.ts
if (process.env.VITEST !== "true" && process.env.OPENCLAW_SUPPRESS_EXTENSION_API_WARNING !== "1") process.emitWarning("openclaw/extension-api is deprecated. Migrate to api.runtime.agent.* or focused openclaw/plugin-sdk/<subpath> imports. See https://docs.stableclaw.ai/plugins/sdk-migration", {
	code: "OPENCLAW_EXTENSION_API_DEPRECATED",
	detail: "This compatibility bridge is temporary. Bundled plugins should use the injected plugin runtime instead of importing host-side agent helpers directly. Migration guide: https://docs.stableclaw.ai/plugins/sdk-migration"
});
//#endregion
export { DEFAULT_MODEL, DEFAULT_PROVIDER, clearPendingRecoveryRequest, createSubagentProgressTracker, emitSubagentFailureRecovery, ensureAgentWorkspace, getAllPendingRecoveryRequests, getPendingRecoveryRequest, loadSessionStore, onSubagentFailure, onSubagentProgress, onSubagentRunProgress, resolveAgentDir, resolveAgentIdentity, resolveAgentTimeoutMs, resolveAgentWorkspaceDir, resolveSessionFilePath, resolveStorePath, resolveThinkingDefault, runEmbeddedPiAgent, saveSessionStore, setRecoveryHandler, submitRecoveryInput };
