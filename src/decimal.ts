export interface Rational {
  num: bigint;
  den: bigint;
}

function parseDecimal(raw: string, maxDecimals: number): Rational {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("invalid rate: empty");
  }
  const re = new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$`);
  if (!re.test(raw)) {
    throw new Error(`invalid rate: ${raw}`);
  }
  const dot = raw.indexOf(".");
  const intPart = dot === -1 ? raw : raw.slice(0, dot);
  const fracPart = dot === -1 ? "" : raw.slice(dot + 1);
  const scale = BigInt(10 ** maxDecimals);
  const num =
    BigInt(intPart) * scale +
    BigInt(fracPart === "" ? 0 : fracPart) *
      BigInt(10 ** (maxDecimals - fracPart.length));
  return { num, den: scale };
}

function checkRange(rate: Rational): void {
  if (rate.num < 0n || rate.num > rate.den * 100n) {
    throw new Error("rate out of range 0..100");
  }
}

export function parsePercentRate(raw: string): Rational {
  const r = parseDecimal(raw, 2);
  checkRange(r);
  return r;
}

export function parseTaxRate(raw: string): Rational {
  const r = parseDecimal(raw, 4);
  checkRange(r);
  return r;
}

export function roundHalfUp(num: bigint, den: bigint): bigint {
  if (den <= 0n) throw new Error("denominator must be positive");
  if (num < 0n) throw new Error("numerator must be non-negative");
  return (2n * num + den) / (2n * den);
}
