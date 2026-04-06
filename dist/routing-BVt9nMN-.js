import "./message-channel-bEWdw4ul.js";
import "./bindings-CYhLRcr8.js";
import "./resolve-route-EE8E7OAF.js";
import "./base-session-key-CRSigEPk.js";
//#region src/infra/outbound/thread-id.ts
function normalizeOutboundThreadId(value) {
	if (value == null) return;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return;
		return String(Math.trunc(value));
	}
	const trimmed = value.trim();
	return trimmed ? trimmed : void 0;
}
//#endregion
export { normalizeOutboundThreadId as t };
