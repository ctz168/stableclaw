import { r as discoverOpenAICompatibleLocalModels } from "./provider-self-hosted-setup-BsDPVG77.js";
import "./provider-setup-CvuG1Eha.js";
import { i as SGLANG_PROVIDER_LABEL } from "./defaults-DRdaSrHq.js";
//#region extensions/sglang/models.ts
async function buildSglangProvider(params) {
	const baseUrl = (params?.baseUrl?.trim() || "http://127.0.0.1:30000/v1").replace(/\/+$/, "");
	return {
		baseUrl,
		api: "openai-completions",
		models: await discoverOpenAICompatibleLocalModels({
			baseUrl,
			apiKey: params?.apiKey,
			label: SGLANG_PROVIDER_LABEL
		})
	};
}
//#endregion
export { buildSglangProvider as t };
