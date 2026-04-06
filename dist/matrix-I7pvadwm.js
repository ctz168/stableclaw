import "./redact-BDinS1q9.js";
import "./links-D7o22Ygt.js";
import "./zod-schema.core-C1Ewlj9j.js";
import "./config-schema-mfJ91WLf.js";
import "./zod-schema.agent-runtime-DFC7a3eV.js";
import "./net-DjzoSxQo.js";
import "./json-store-FUgu1pyj.js";
import "./session-binding-service-D7bUc7mS.js";
import "./setup-helpers-0yWIq2cW.js";
import "./channel-plugin-common-D2EFcTg8.js";
import "./status-helpers-CCJSSrVJ.js";
import "./identity-DvwF6Yix.js";
import "./common-Dbmo0I1E.js";
import "./fetch-guard-DCj2_spg.js";
import "./local-roots-DrpNBv4b.js";
import "./secret-input-Bqf5ho4v.js";
import "./setup-wizard-helpers-4lMI_ec6.js";
import "./run-command-DUNqt3P7.js";
import "./runtime-C5__utHi.js";
import { t as createOptionalChannelSetupSurface } from "./channel-setup-BnePySDW.js";
import "./reply-prefix-CF1BWqkz.js";
import "./channel-reply-pipeline-CkNQohFS.js";
import "./outbound-media-CE8fphwh.js";
import "./setup-group-access-DtQ93kDF.js";
import "./matrix-thread-bindings-Bfw7bC_m.js";
import "./matrix-helper-BTONIhW-.js";
import "./matrix-runtime-surface-BYx549hb.js";
import "./matrix-surface-EZ2JTZoE.js";
//#region src/plugin-sdk/matrix.ts
const matrixSetup = createOptionalChannelSetupSurface({
	channel: "matrix",
	label: "Matrix",
	npmSpec: "@stableclaw/matrix",
	docsPath: "/channels/matrix"
});
const matrixSetupWizard = matrixSetup.setupWizard;
const matrixSetupAdapter = matrixSetup.setupAdapter;
//#endregion
export { matrixSetupWizard as n, matrixSetupAdapter as t };
