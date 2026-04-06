import "./method-scopes-B6e_KuRU.js";
import "./operator-approvals-client-DZzMpgK9.js";
//#region src/gateway/channel-status-patches.ts
function createConnectedChannelStatusPatch(at = Date.now()) {
	return {
		connected: true,
		lastConnectedAt: at,
		lastEventAt: at
	};
}
//#endregion
export { createConnectedChannelStatusPatch as t };
