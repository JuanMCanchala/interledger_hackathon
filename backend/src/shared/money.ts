import { AppError } from "./errors.js";

/** Open Payments amount: `value` is an integer string in minor units (e.g. "1250" = 12.50 with scale 2). */
export interface Amount {
  value: string;
  assetCode: string;
  assetScale: number;
}

export interface Asset {
  assetCode: string;
  assetScale: number;
}

export class AmountError extends AppError {
  constructor(message: string) {
    super(message, 400);
    this.name = "AmountError";
  }
}

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

/** "12.5" with scale 2 → "1250". Uses BigInt so large COP amounts never lose precision. */
export function toMinorUnits(decimal: string, assetScale: number): string {
  const input = decimal.trim();
  if (!DECIMAL_PATTERN.test(input)) {
    throw new AmountError(
      `Monto inválido: "${decimal}". Usa un número positivo, por ejemplo 12.50`,
    );
  }
  const [whole = "0", fraction = ""] = input.split(".");
  if (fraction.length > assetScale) {
    throw new AmountError(
      `El monto ${input} tiene más de ${assetScale} decimales`,
    );
  }
  const minor = BigInt(whole + fraction.padEnd(assetScale, "0"));
  if (minor <= 0n) throw new AmountError("El monto debe ser mayor que cero");
  return minor.toString();
}

/** "1250" with scale 2 → "12.50". */
export function fromMinorUnits(value: string, assetScale: number): string {
  const minor = BigInt(value);
  if (assetScale === 0) return minor.toString();
  const sign = minor < 0n ? "-" : "";
  const digits = (minor < 0n ? -minor : minor)
    .toString()
    .padStart(assetScale + 1, "0");
  return `${sign}${digits.slice(0, -assetScale)}.${digits.slice(-assetScale)}`;
}

export function toAmount(decimal: string, asset: Asset): Amount {
  return {
    value: toMinorUnits(decimal, asset.assetScale),
    assetCode: asset.assetCode,
    assetScale: asset.assetScale,
  };
}

/** Negative if a < b, zero if equal, positive if a > b. Both amounts must share the asset. */
export function compareAmounts(a: Amount, b: Amount): number {
  if (a.assetCode !== b.assetCode || a.assetScale !== b.assetScale) {
    throw new AmountError(
      `No se pueden comparar ${a.assetCode} y ${b.assetCode}`,
    );
  }
  const diff = BigInt(a.value) - BigInt(b.value);
  return diff === 0n ? 0 : diff > 0n ? 1 : -1;
}

/** "$ 300.000" for messages people read, in Colombian format; "12,50 USD" for other currencies. */
export function formatAmount(amount: Amount): string {
  const value = Number(fromMinorUnits(amount.value, amount.assetScale));
  const fraction = Number.isInteger(value) ? 0 : 2;
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: amount.assetCode,
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    }).format(value);
  } catch {
    return `${value.toLocaleString("es-CO", { maximumFractionDigits: 2 })} ${amount.assetCode}`;
  }
}
