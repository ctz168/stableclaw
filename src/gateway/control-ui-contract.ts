export const CONTROL_UI_BOOTSTRAP_CONFIG_PATH = "/__openclaw/control-ui-config.json";

export type ControlUiBootstrapConfig = {
  basePath: string;
  assistantName: string;
  assistantAvatar: string;
  /**
   * When true, the UI should redirect to the /onboard wizard because
   * the gateway has not been fully configured yet (missing auth or provider).
   */
  onboardNeeded: boolean;
};
