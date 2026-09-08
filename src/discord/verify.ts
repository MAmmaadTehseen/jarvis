/**
 * Discord signs every interaction request with Ed25519 and will not accept an
 * endpoint that fails to reject a bad signature: during setup it deliberately
 * sends invalid ones and expects a 401.
 *
 * Node can verify this without a library. A raw 32-byte Ed25519 public key needs
 * wrapping in a fixed SPKI DER header before createPublicKey will take it.
 */
import { createPublicKey, verify, type KeyObject } from "node:crypto";

/** SEQUENCE { SEQUENCE { OID 1.3.101.112 } BIT STRING } — constant for Ed25519. */
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const cache = new Map<string, KeyObject>();

function publicKey(hex: string): KeyObject {
  let key = cache.get(hex);
  if (!key) {
    const raw = Buffer.from(hex, "hex");
    if (raw.length !== 32) throw new Error(`Ed25519 public key must be 32 bytes, got ${raw.length}`);
    key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" });
    cache.set(hex, key);
  }
  return key;
}

/**
 * True when `signature` covers `timestamp + rawBody` for the given public key.
 * `rawBody` must be the exact bytes Discord sent: re-serialising the parsed JSON
 * changes the signature and every request fails.
 */
export function isValidSignature(opts: {
  publicKeyHex: string;
  signature: string | undefined;
  timestamp: string | undefined;
  rawBody: string;
}): boolean {
  const { publicKeyHex, signature, timestamp, rawBody } = opts;
  if (!signature || !timestamp) return false;
  if (!/^[0-9a-f]{128}$/i.test(signature)) return false;

  try {
    return verify(null, Buffer.from(timestamp + rawBody, "utf8"), publicKey(publicKeyHex), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
