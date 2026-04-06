import "./model-definitions-DDVZFugu.js";
import "./provider-catalog-H_UHPYE4.js";
import "./onboard-V63acj6T.js";
const MISTRAL_MODEL_COMPAT_PATCH = {
	supportsStore: false,
	supportsReasoningEffort: false,
	maxTokensField: "max_tokens"
};
function applyMistralModelCompat(model) {
	const compat = model.compat && typeof model.compat === "object" ? model.compat : void 0;
	if (compat && Object.entries(MISTRAL_MODEL_COMPAT_PATCH).every(([key, value]) => compat[key] === value)) return model;
	return {
		...model,
		compat: {
			...compat,
			...MISTRAL_MODEL_COMPAT_PATCH
		}
	};
}
//#endregion
export { applyMistralModelCompat as n, MISTRAL_MODEL_COMPAT_PATCH as t };
