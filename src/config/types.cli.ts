export type CliBannerTaglineMode = "off" | "default" | "random";

export type CliConfig = {
  banner?: {
    /**
     * Controls CLI banner tagline behavior.
     * - "off" (default): hide tagline text for minimal output
     * - "default": always use DEFAULT_TAGLINE
     * - "random": pick from tagline pool (adds startup overhead)
     */
    taglineMode?: CliBannerTaglineMode;
  };
};
