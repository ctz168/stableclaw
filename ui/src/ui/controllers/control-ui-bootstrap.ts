import {
  CONTROL_UI_BOOTSTRAP_CONFIG_PATH,
  type ControlUiBootstrapConfig,
} from "../../../../src/gateway/control-ui-contract.js";
import { normalizeAssistantIdentity } from "../assistant-identity.ts";
import { normalizeBasePath } from "../navigation.ts";

export type ControlUiBootstrapState = {
  basePath: string;
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  serverVersion: string | null;
  /**
   * Set to true by the bootstrap endpoint when the gateway has not been
   * fully configured and the user should be sent to /onboard.
   */
  onboardNeeded?: boolean;
};

export async function loadControlUiBootstrapConfig(state: ControlUiBootstrapState) {
  if (typeof window === "undefined") {
    return;
  }
  if (typeof fetch !== "function") {
    return;
  }

  const basePath = normalizeBasePath(state.basePath ?? "");
  const url = basePath
    ? `${basePath}${CONTROL_UI_BOOTSTRAP_CONFIG_PATH}`
    : CONTROL_UI_BOOTSTRAP_CONFIG_PATH;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!res.ok) {
      return;
    }
    const parsed = (await res.json()) as ControlUiBootstrapConfig;
    const normalized = normalizeAssistantIdentity({
      name: parsed.assistantName,
      avatar: parsed.assistantAvatar ?? null,
    });
    state.assistantName = normalized.name;
    state.assistantAvatar = normalized.avatar;

    // If the gateway signals that onboard is needed, redirect the browser
    // to the /onboard wizard.  We check the current path to avoid looping
    // if the user is already on the onboard page.
    if (parsed.onboardNeeded) {
      const currentPath = window.location.pathname;
      const basePath = normalizeBasePath(state.basePath ?? "");
      const onboardPath = basePath ? `${basePath}/onboard` : "/onboard";
      if (currentPath !== onboardPath) {
        window.location.replace(onboardPath);
      }
    }
  } catch {
    // Ignore bootstrap failures; UI will update identity after connecting.
  }
}
