import { n as describeImagesWithModel, t as describeImageWithModel } from "./image-runtime-DixnJf3l.js";
import "./media-understanding-OGi6DErH.js";
//#region extensions/anthropic/media-understanding-provider.ts
const anthropicMediaUnderstandingProvider = {
	id: "anthropic",
	capabilities: ["image"],
	describeImage: describeImageWithModel,
	describeImages: describeImagesWithModel
};
//#endregion
export { anthropicMediaUnderstandingProvider as t };
