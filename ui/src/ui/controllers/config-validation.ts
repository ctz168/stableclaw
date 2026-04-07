import type { GatewayBrowserClient } from "../gateway.ts";

/**
 * Client-side config validation controller.
 *
 * Validates config changes against the gateway's `config.validate` RPC
 * before allowing the user to save or apply. This provides immediate
 * feedback without requiring a full round-trip through config.set which
 * would write to disk.
 */

export type ConfigValidationIssue = {
  path: string;
  message: string;
  suggestion?: string;
  expected?: string;
  received?: string;
  allowedValues?: string[];
};

export type ConfigValidationResult = {
  valid: boolean;
  issues: ConfigValidationIssue[];
};

export type ConfigValidationState = {
  validating: boolean;
  lastResult: ConfigValidationResult | null;
  /** Timestamp of last validation request (for debouncing) */
  lastValidationRequest: number;
  /** Pending debounce timer ID */
  debounceTimerId: ReturnType<typeof setTimeout> | null;
};

/**
 * Default debounce delay in milliseconds for config validation.
 */
const VALIDATION_DEBOUNCE_MS = 500;

/**
 * Create a fresh config validation state.
 */
export function createConfigValidationState(): ConfigValidationState {
  return {
    validating: false,
    lastResult: null,
    lastValidationRequest: 0,
    debounceTimerId: null,
  };
}

/**
 * Cancel any pending debounced validation.
 */
export function cancelPendingValidation(state: ConfigValidationState): void {
  if (state.debounceTimerId !== null) {
    clearTimeout(state.debounceTimerId);
    state.debounceTimerId = null;
  }
}

/**
 * Request config validation (debounced).
 *
 * If called again before the debounce delay expires, the previous request
 * is cancelled and a new one is scheduled. Returns immediately; results
 * are stored in `state.lastResult`.
 *
 * @param raw  The raw config string to validate
 * @param state  Mutable validation state
 * @param client  Active gateway browser client
 * @param delayMs  Optional debounce override (default: 500ms)
 */
export function requestValidation(
  raw: string,
  state: ConfigValidationState,
  client: GatewayBrowserClient | null,
  delayMs: number = VALIDATION_DEBOUNCE_MS,
): void {
  cancelPendingValidation(state);

  if (!raw.trim()) {
    // Empty config is trivially invalid; don't bother the server.
    state.lastResult = {
      valid: false,
      issues: [{ path: "<root>", message: "Config is empty" }],
    };
    state.validating = false;
    return;
  }

  // Basic JSON syntax check before hitting the server
  if (!hasBalancedBrackets(raw)) {
    state.lastResult = {
      valid: false,
      issues: [
        {
          path: "<root>",
          message: "JSON syntax error: unmatched brackets or braces",
          suggestion: "Check for missing closing brackets, braces, or parentheses.",
        },
      ],
    };
    state.validating = false;
    return;
  }

  state.validating = true;

  state.debounceTimerId = setTimeout(async () => {
    state.debounceTimerId = null;

    if (!client) {
      state.validating = false;
      return;
    }

    try {
      state.lastValidationRequest = Date.now();
      const requestId = state.lastValidationRequest;

      const result = await client.request<ConfigValidationResult>("config.validate", { raw });

      // Only apply if this is still the most recent request
      if (requestId === state.lastValidationRequest) {
        state.lastResult = result;
      }
    } catch {
      // Validation request failed — don't block the user; clear validating state.
      // The last result (if any) stays so the UI can show it.
    } finally {
      state.validating = false;
    }
  }, delayMs);
}

/**
 * Request immediate (non-debounced) validation.
 * Use this for pre-save checks where the user clicked "Save" or "Apply".
 */
export async function validateConfigNow(
  raw: string,
  state: ConfigValidationState,
  client: GatewayBrowserClient | null,
): Promise<ConfigValidationResult | null> {
  cancelPendingValidation(state);

  if (!client) {
    return null;
  }

  state.validating = true;

  try {
    const result = await client.request<ConfigValidationResult>("config.validate", { raw });
    state.lastResult = result;
    return result;
  } catch {
    return null;
  } finally {
    state.validating = false;
  }
}

/**
 * Check if the current validation state allows saving.
 * Returns true if validation passed (or no validation has been performed yet).
 */
export function canSaveWithValidation(state: ConfigValidationState): boolean {
  if (!state.lastResult) {
    return true; // No validation done yet — allow save (will be validated server-side)
  }
  return state.lastResult.valid;
}

/**
 * Get a user-friendly summary of validation issues.
 */
export function formatValidationSummary(result: ConfigValidationResult): string {
  if (result.valid) {
    if (result.issues.length > 0) {
      return `Valid with ${result.issues.length} warning(s)`;
    }
    return "Valid";
  }
  const count = result.issues.length;
  return `${count} validation error${count !== 1 ? "s" : ""}`;
}

/**
 * Very lightweight bracket-matching check.
 * This is NOT a full JSON parser — just catches the most common mistakes
 * (unmatched { } and [ ]) before sending to the server.
 */
function hasBalancedBrackets(text: string): boolean {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
    } else if (ch === '"') {
      // Skip string literals
      i++;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          break;
        }
        i++;
      }
    } else if (ch === "/" && text[i + 1] === "/") {
      // Skip line comments
      while (i < text.length && text[i] !== "\n") {
        i++;
      }
    } else if (ch === "/" && text[i + 1] === "*") {
      // Skip block comments
      i += 2;
      while (i < text.length - 1) {
        if (text[i] === "*" && text[i + 1] === "/") {
          i++;
          break;
        }
        i++;
      }
    }
  }
  return depth === 0;
}
