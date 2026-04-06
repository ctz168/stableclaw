import { g as resolveDefaultModelForAgent } from "./model-selection-w1RJdjfl.js";
import { i as loadModelCatalog, n as findModelInCatalog, o as modelSupportsVision } from "./model-catalog-DET44kqI.js";
import "./agent-runtime-Css0zKcC.js";
//#region extensions/telegram/src/sticker-vision.runtime.ts
async function resolveStickerVisionSupportRuntime(params) {
	const catalog = await loadModelCatalog({ config: params.cfg });
	const defaultModel = resolveDefaultModelForAgent({
		cfg: params.cfg,
		agentId: params.agentId
	});
	const entry = findModelInCatalog(catalog, defaultModel.provider, defaultModel.model);
	if (!entry) return false;
	return modelSupportsVision(entry);
}
//#endregion
export { resolveStickerVisionSupportRuntime };
