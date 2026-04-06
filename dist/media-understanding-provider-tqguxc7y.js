import { n as describeImagesWithModel, t as describeImageWithModel } from "./image-runtime-DixnJf3l.js";
import "./media-understanding-OGi6DErH.js";
//#region extensions/openrouter/media-understanding-provider.ts
const openrouterMediaUnderstandingProvider = {
	id: "openrouter",
	capabilities: ["image"],
	describeImage: describeImageWithModel,
	describeImages: describeImagesWithModel
};
//#endregion
export { openrouterMediaUnderstandingProvider as t };
