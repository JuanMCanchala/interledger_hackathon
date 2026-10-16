import { describe, expect, it } from "vitest";
import { parseHosts } from "../src/config.js";
import {
  AmountError,
  compareAmounts,
  formatAmount,
  fromMinorUnits,
  toAmount,
  toMinorUnits,
} from "../src/shared/money.js";
import {
  computeInteractHash,
  verifyInteractHash,
} from "../src/openPayments/hash.js";
import { buildRepeatingInterval } from "../src/openPayments/interval.js";
import {
  assertAllowedWalletHost,
  normalizeWalletAddressUrl,
} from "../src/openPayments/walletAddress.js";

describe("amounts", () => {
  it("converts decimals to minor units with the asset scale", () => {
    expect(toMinorUnits("12.5", 2)).toBe("1250");
    expect(toMinorUnits("50000", 2)).toBe("5000000");
    expect(toMinorUnits("0.01", 2)).toBe("1");
    expect(toMinorUnits("7", 0)).toBe("7");
  });

  it("keeps precision for very large amounts", () => {
    expect(toMinorUnits("123456789012345678.99", 2)).toBe(
      "12345678901234567899",
    );
  });

  it("rejects invalid, zero or over-precise amounts", () => {
    expect(() => toMinorUnits("abc", 2)).toThrow(AmountError);
    expect(() => toMinorUnits("-5", 2)).toThrow(AmountError);
    expect(() => toMinorUnits("0", 2)).toThrow("mayor que cero");
    expect(() => toMinorUnits("1.234", 2)).toThrow("más de 2 decimales");
  });

  it("formats minor units back to decimals", () => {
    expect(fromMinorUnits("1250", 2)).toBe("12.50");
    expect(fromMinorUnits("5", 2)).toBe("0.05");
    expect(fromMinorUnits("42", 0)).toBe("42");
    expect(
      formatAmount(toAmount("50000", { assetCode: "COP", assetScale: 2 })),
    ).toBe("50000.00 COP");
  });

  it("compares amounts of the same asset only", () => {
    const usd = (value: string) => ({ value, assetCode: "USD", assetScale: 2 });
    expect(compareAmounts(usd("100"), usd("99"))).toBe(1);
    expect(compareAmounts(usd("100"), usd("100"))).toBe(0);
    expect(compareAmounts(usd("1"), usd("100"))).toBe(-1);
    expect(() =>
      compareAmounts(usd("1"), { value: "1", assetCode: "EUR", assetScale: 2 }),
    ).toThrow();
  });
});

describe("interaction hash", () => {
  const input = {
    clientNonce: "client-nonce",
    interactNonce: "server-nonce",
    interactRef: "ref-123",
    authServerUrl: "https://auth.interledger-test.dev/tenant-1",
  };

  it("accepts the padded base64 hash Rafiki sends", () => {
    expect(verifyInteractHash(input, computeInteractHash(input))).toBe(true);
  });

  it("accepts unpadded hashes, '+' turned into spaces and trailing-slash URLs", () => {
    const hash = computeInteractHash(input);
    expect(verifyInteractHash(input, hash.replace(/=+$/, ""))).toBe(true);
    expect(verifyInteractHash(input, hash.replace(/\+/g, " "))).toBe(true);
    const withSlash = { ...input, authServerUrl: `${input.authServerUrl}/` };
    expect(verifyInteractHash(input, computeInteractHash(withSlash))).toBe(
      true,
    );
  });

  it("rejects a hash computed for another interaction", () => {
    const other = computeInteractHash({ ...input, interactRef: "ref-999" });
    expect(verifyInteractHash(input, other)).toBe(false);
    expect(verifyInteractHash(input, "not-a-hash")).toBe(false);
  });
});

describe("repeating interval", () => {
  const start = new Date("2026-10-16T15:00:00.123Z");

  it("builds open-ended and limited intervals without milliseconds", () => {
    expect(buildRepeatingInterval("P1W", { start })).toBe(
      "R/2026-10-16T15:00:00Z/P1W",
    );
    expect(buildRepeatingInterval("PT1M", { start, repetitions: 10 })).toBe(
      "R10/2026-10-16T15:00:00Z/PT1M",
    );
  });

  it("rejects invalid durations and repetitions", () => {
    expect(() => buildRepeatingInterval("1 week", { start })).toThrow(
      "Duración ISO 8601 inválida",
    );
    expect(() => buildRepeatingInterval("P", { start })).toThrow();
    expect(() =>
      buildRepeatingInterval("P1D", { start, repetitions: 0 }),
    ).toThrow();
  });
});

describe("wallet addresses", () => {
  it("turns payment pointers into https URLs", () => {
    expect(normalizeWalletAddressUrl("$ilp.interledger-test.dev/alice")).toBe(
      "https://ilp.interledger-test.dev/alice",
    );
    expect(
      normalizeWalletAddressUrl(" https://ilp.interledger-test.dev/alice/ "),
    ).toBe("https://ilp.interledger-test.dev/alice");
    expect(normalizeWalletAddressUrl("$example.com")).toBe(
      "https://example.com/.well-known/pay",
    );
  });

  it("rejects non-https URLs, queries and garbage", () => {
    expect(() =>
      normalizeWalletAddressUrl("http://ilp.interledger-test.dev/alice"),
    ).toThrow("https");
    expect(() =>
      normalizeWalletAddressUrl("https://ilp.interledger-test.dev/alice?x=1"),
    ).toThrow();
    expect(() => normalizeWalletAddressUrl("alice")).toThrow("inválida");
  });

  it("only allows the configured hosts", () => {
    const hosts = parseHosts("ilp.interledger-test.dev, other.example");
    expect(() =>
      assertAllowedWalletHost("https://ilp.interledger-test.dev/a", hosts),
    ).not.toThrow();
    expect(() =>
      assertAllowedWalletHost("https://evil.example/a", hosts),
    ).toThrow("no está permitido");
    expect(() =>
      assertAllowedWalletHost("https://evil.example/a", parseHosts("*")),
    ).not.toThrow();
  });
});
