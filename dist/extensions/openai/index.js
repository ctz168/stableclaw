import { t as definePluginEntry } from "../../plugin-entry-D0vhddM4.js";
import { t as buildOpenAICodexCliBackend } from "../../cli-backend-ngBQTKQo.js";
import { t as buildOpenAIImageGenerationProvider } from "../../image-generation-provider-DXqayi2M.js";
import { n as openaiCodexMediaUnderstandingProvider, r as openaiMediaUnderstandingProvider } from "../../media-understanding-provider-B_6mZ4rC.js";
import { t as buildOpenAICodexProviderPlugin } from "../../openai-codex-provider-XTXKkt1t.js";
import { t as buildOpenAIProvider } from "../../openai-provider-BhSsmGTb.js";
import { t as buildOpenAISpeechProvider } from "../../speech-provider-NBjGxOHZ.js";
//#region extensions/openai/index.ts
var openai_default = definePluginEntry({
	id: "openai",
	name: "OpenAI Provider",
	description: "Bundled OpenAI provider plugins",
	register(api) {
		api.registerCliBackend(buildOpenAICodexCliBackend());
		api.registerProvider(buildOpenAIProvider());
		api.registerProvider(buildOpenAICodexProviderPlugin());
		api.registerSpeechProvider(buildOpenAISpeechProvider());
		api.registerMediaUnderstandingProvider(openaiMediaUnderstandingProvider);
		api.registerMediaUnderstandingProvider(openaiCodexMediaUnderstandingProvider);
		api.registerImageGenerationProvider(buildOpenAIImageGenerationProvider());
	}
});
//#endregion
export { openai_default as default };
