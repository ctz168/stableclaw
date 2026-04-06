import "./utils-CN_F_3Qg.js";
import "./links-D7o22Ygt.js";
import "./setup-helpers-0yWIq2cW.js";
import "./setup-binary-CXmsVXWb.js";
import "./signal-cli-install-DcmsRDbB.js";
import "./setup-wizard-proxy-bmMo6OPA.js";
import "./setup-wizard-helpers-4lMI_ec6.js";
//#region src/plugin-sdk/resolution-notes.ts
/** Format a short note that separates successfully resolved targets from unresolved passthrough values. */
function formatResolvedUnresolvedNote(params) {
	if (params.resolved.length === 0 && params.unresolved.length === 0) return;
	return [params.resolved.length > 0 ? `Resolved: ${params.resolved.join(", ")}` : void 0, params.unresolved.length > 0 ? `Unresolved (kept as typed): ${params.unresolved.join(", ")}` : void 0].filter(Boolean).join("\n");
}
//#endregion
export { formatResolvedUnresolvedNote as t };
