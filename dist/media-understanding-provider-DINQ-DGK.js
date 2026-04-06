import { n as describeImagesWithModel, t as describeImageWithModel } from "./image-runtime-DixnJf3l.js";
import "./media-understanding-OGi6DErH.js";
//#region extensions/zai/media-understanding-provider.ts
const zaiMediaUnderstandingProvider = {
	id: "zai",
	capabilities: ["image"],
	describeImage: describeImageWithModel,
	describeImages: describeImagesWithModel
};
//#endregion
export { zaiMediaUnderstandingProvider as t };
