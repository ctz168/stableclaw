import { o as readSessionUpdatedAt } from "./store-B1hpZkjb.js";
import "./sessions-DukJH1Gz.js";
import { l as resolveStorePath } from "./paths-xpks599B.js";
import { a as resolveEnvelopeFormatOptions } from "./envelope-CrC9AdBL.js";
//#region src/channels/session-envelope.ts
function resolveInboundSessionEnvelopeContext(params) {
	const storePath = resolveStorePath(params.cfg.session?.store, { agentId: params.agentId });
	return {
		storePath,
		envelopeOptions: resolveEnvelopeFormatOptions(params.cfg),
		previousTimestamp: readSessionUpdatedAt({
			storePath,
			sessionKey: params.sessionKey
		})
	};
}
//#endregion
export { resolveInboundSessionEnvelopeContext as t };
