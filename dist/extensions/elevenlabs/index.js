import { t as definePluginEntry } from "../../plugin-entry-D0vhddM4.js";
import { t as buildElevenLabsSpeechProvider } from "../../speech-provider-5bYEMzey.js";
//#region extensions/elevenlabs/index.ts
var elevenlabs_default = definePluginEntry({
	id: "elevenlabs",
	name: "ElevenLabs Speech",
	description: "Bundled ElevenLabs speech provider",
	register(api) {
		api.registerSpeechProvider(buildElevenLabsSpeechProvider());
	}
});
//#endregion
export { elevenlabs_default as default };
