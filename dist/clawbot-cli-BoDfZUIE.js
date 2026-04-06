import { t as formatDocsLink } from "./links-D7o22Ygt.js";
import { r as theme } from "./theme-wBMZmJzz.js";
import { t as registerQrCli } from "./qr-cli-BVUvl2V5.js";
//#region src/cli/clawbot-cli.ts
function registerClawbotCli(program) {
	registerQrCli(program.command("clawbot").description("Legacy clawbot command aliases").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/clawbot", "docs.stableclaw.ai/cli/clawbot")}\n`));
}
//#endregion
export { registerClawbotCli };
