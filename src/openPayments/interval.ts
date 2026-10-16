import { AppError } from "./errors.js";

/** ISO 8601 duration such as P1W, P1M, P15D or PT1M (one minute, handy for live demos). */
export const DURATION_PATTERN =
  /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/;

export interface IntervalOptions {
  start?: Date;
  /** Omit for an open-ended interval ("R/..."). */
  repetitions?: number;
}

/**
 * Builds the repeating interval used in outgoing-payment grant limits,
 * e.g. "R/2026-10-16T15:00:00Z/P1W": the debit limit resets every week.
 */
export function buildRepeatingInterval(
  duration: string,
  options: IntervalOptions = {},
): string {
  if (!DURATION_PATTERN.test(duration)) {
    throw new AppError(
      `Duración ISO 8601 inválida: "${duration}". Ejemplos: P1W, P1M, PT1M`,
    );
  }
  const { repetitions } = options;
  if (
    repetitions !== undefined &&
    (!Number.isInteger(repetitions) || repetitions < 1)
  ) {
    throw new AppError(
      "Las repeticiones deben ser un entero mayor o igual a 1",
    );
  }
  const start = (options.start ?? new Date())
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  return `R${repetitions ?? ""}/${start}/${duration}`;
}
