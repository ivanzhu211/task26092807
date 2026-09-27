/**
 * 解析非负十进制字符串（如 "8.875"），返回放大 scale 倍后的整数值。
 * 拒绝：空串、负号、科学计数法、非数字字符、小数位超过 maxDecimals。
 * 解析过程只用整数运算，不经过浮点。
 */
export function parseDecimalScaled(s: string, maxDecimals: number, scale: bigint): bigint | null {
  if (typeof s !== 'string' || s.length === 0) return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const dot = s.indexOf('.');
  const intPart = dot === -1 ? s : s.slice(0, dot);
  const fracPart = dot === -1 ? '' : s.slice(dot + 1);
  if (fracPart.length > maxDecimals) return null;
  const intVal = BigInt(intPart);
  let fracVal = 0n;
  for (let i = 0; i < fracPart.length; i++) {
    fracVal = fracVal * 10n + BigInt(fracPart.charCodeAt(i) - 48);
  }
  let fracScale = 1n;
  for (let i = 0; i < fracPart.length; i++) fracScale *= 10n;
  // value = intVal + fracVal/fracScale，放大 scale 倍后须为整数（已限制小数位数）
  return intVal * scale + (fracVal * scale) / fracScale;
}

/** 四舍五入（恰好一半时进位）计算 round(a/b)，要求 a>=0, b>0 */
export function divRoundHalfUp(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  return r * 2n >= b ? q + 1n : q;
}
