/**
 * Discord validates an interactions endpoint by sending deliberately bad
 * signatures and expecting a 401. Getting this wrong means the endpoint is
 * rejected at setup, so it is worth testing against real Ed25519 keys.
 */
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidSignature } from "../src/discord/verify.js";

/** Discord publishes the raw 32-byte key as hex; extract that from a DER SPKI. */
function makeKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  return { publicKeyHex: der.subarray(der.length - 32).toString("hex"), privateKey };
}

function signBody(privateKey: ReturnType<typeof makeKeypair>["privateKey"], timestamp: string, body: string) {
  return sign(null, Buffer.from(timestamp + body, "utf8"), privateKey).toString("hex");
}

describe("interaction signature verification", () => {
  const { publicKeyHex, privateKey } = makeKeypair();
  const timestamp = "1757260800";
  const rawBody = JSON.stringify({ type: 1 });
  const signature = signBody(privateKey, timestamp, rawBody);

  it("accepts a correctly signed request", () => {
    expect(isValidSignature({ publicKeyHex, signature, timestamp, rawBody })).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(isValidSignature({ publicKeyHex, signature, timestamp, rawBody: JSON.stringify({ type: 2 }) })).toBe(false);
  });

  it("rejects a replay under a different timestamp", () => {
    expect(isValidSignature({ publicKeyHex, signature, timestamp: "1757260801", rawBody })).toBe(false);
  });

  it("rejects a signature from a different key", () => {
    const other = makeKeypair();
    const otherSig = signBody(other.privateKey, timestamp, rawBody);
    expect(isValidSignature({ publicKeyHex, signature: otherSig, timestamp, rawBody })).toBe(false);
  });

  it("rejects missing, malformed and non-hex signatures without throwing", () => {
    for (const bad of [undefined, "", "nope", "zz".repeat(64), "ab".repeat(10)]) {
      expect(isValidSignature({ publicKeyHex, signature: bad, timestamp, rawBody })).toBe(false);
    }
    expect(isValidSignature({ publicKeyHex, signature, timestamp: undefined, rawBody })).toBe(false);
  });

  it("does not throw on a malformed public key", () => {
    expect(isValidSignature({ publicKeyHex: "abcd", signature, timestamp, rawBody })).toBe(false);
  });
});
