import "server-only";
import { encryptSecret, decryptSecret, encryptionAvailable } from "@/lib/integrations/crypto";

/**
 * ENCRYPTION FOR AUTOMATION BOX CONFIGS (2026-11-24).
 *
 * When users configure per-node credentials (bot_token, api_key,
 * webhook_url, connection_string, etc.) in the n8n-style node editor,
 * those values are stored in `automation_flows.boxes[].config`.
 *
 * Without encryption, a database leak exposes every Telegram bot token,
 * every Slack webhook URL, every Stripe secret key the user typed in.
 * That is the same risk the OAuth token encryption solves, and the same
 * AES-256-GCM key handles both.
 *
 * WHICH FIELDS ARE SENSITIVE: any config key that contains "token",
 * "key", "secret", "password", or "connection_string". URLs (webhook_url,
 * url) are NOT encrypted — they are not credentials, and encrypting them
 * would prevent URL validation at store time.
 *
 * FORMAT: sensitive values are stored as "enc:v1.<iv>.<tag>.<ciphertext>",
 * so readConfig() can tell encrypted from plain without a flag column.
 * The "enc:" prefix distinguishes them from user-typed values that
 * happen to contain dots.
 */

const ENC_PREFIX = "enc:";

/** Config keys whose values contain credentials and must be encrypted. */
/** Config keys whose values contain credentials and must be encrypted.
 * Covers all integration config fields that hold secrets:
 * bot_token, api_key, token, secret, password, connection_string,
 * consumer_secret, access_token, private_key, service_account.
 */
const SENSITIVE_KEYS = /^(bot_token|api_key|token|secret|password|connection_string|consumer_secret|access_token|private_key|service_account)$/i;

function isSensitive(key: string): boolean {
  return SENSITIVE_KEYS.test(key);
}

/** Build the AAD context for a config value: ties it to the flow + box + key. */
function configContext(flowId: string, boxId: string, key: string): string {
  return `ionexa:automation:config:${flowId}:${boxId}:${key}`;
}

/**
 * Encrypt sensitive fields in a box's config before saving to the database.
 * Non-sensitive fields (URLs, channel names, subjects) are stored as-is.
 * If encryption is not available (no key configured), sensitive fields
 * are REJECTED — the config is returned without them, and a warning is logged.
 */
export function encryptBoxConfig(
  config: Record<string, string> | undefined,
  flowId: string,
  boxId: string,
): Record<string, string> | undefined {
  if (!config) return undefined;
  const hasEncryption = encryptionAvailable();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    if (!v) continue;
    if (isSensitive(k)) {
      if (!hasEncryption) {
        // Skip — do not store plaintext credentials
        console.warn(`[config-crypto] Skipping sensitive key "${k}" — no encryption key configured`);
        continue;
      }
      out[k] = ENC_PREFIX + encryptSecret(v, configContext(flowId, boxId, k));
    } else {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Decrypt sensitive fields in a box's config when reading from the database.
 * Values without the "enc:" prefix are returned as-is (non-sensitive or
 * legacy plaintext).
 */
export function decryptBoxConfig(
  config: Record<string, string> | undefined,
  flowId: string,
  boxId: string,
): Record<string, string> | undefined {
  if (!config) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === "string" && v.startsWith(ENC_PREFIX)) {
      try {
        out[k] = decryptSecret(v.slice(ENC_PREFIX.length), configContext(flowId, boxId, k));
      } catch {
        // Decryption failed — key rotated, corrupted, or wrong flow.
        // Return empty so the user sees an empty field and can re-enter.
        out[k] = "";
      }
    } else {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Encrypt configs in ALL boxes of a flow before saving.
 * Returns a new boxes array with encrypted configs — does NOT mutate.
 */
export function encryptFlowBoxConfigs<T extends { id: string; config?: Record<string, string> }>(
  boxes: T[],
  flowId: string,
): T[] {
  return boxes.map((box) => {
    if (!box.config) return box;
    const encrypted = encryptBoxConfig(box.config, flowId, box.id);
    return encrypted ? { ...box, config: encrypted } : box;
  });
}

/**
 * Decrypt configs in ALL boxes of a flow after reading from the database.
 */
export function decryptFlowBoxConfigs<T extends { id: string; config?: Record<string, string> }>(
  boxes: T[],
  flowId: string,
): T[] {
  return boxes.map((box) => {
    if (!box.config) return box;
    const decrypted = decryptBoxConfig(box.config, flowId, box.id);
    return decrypted ? { ...box, config: decrypted } : box;
  });
}
