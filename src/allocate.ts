/**
 * 最大余数法分摊：把 total 按 weights 比例分摊。
 * 每份是精确值 total*weight[i]/weightSum 的 floor 或 ceil，各份之和恰为 total。
 * 余数相等时按 keys 的字典序（code unit 比较）决定先后，
 * 因此结果只取决于 (key, weight) 集合，与传入顺序无关。
 * total 为 0 或权重和为 0 时全部返回 0（避免除零）。
 */
export function allocate(total: bigint, weights: bigint[], keys: string[]): bigint[] {
  const n = weights.length;
  const result = new Array<bigint>(n).fill(0n);
  if (total <= 0n) return result;
  let weightSum = 0n;
  for (const w of weights) weightSum += w;
  if (weightSum <= 0n) return result;

  const remainders: { index: number; remainder: bigint; key: string }[] = [];
  let floorSum = 0n;
  for (let i = 0; i < n; i++) {
    const exact = total * weights[i];
    const floor = exact / weightSum;
    const remainder = exact % weightSum;
    result[i] = floor;
    floorSum += floor;
    remainders.push({ index: i, remainder, key: keys[i] });
  }

  let leftover = total - floorSum; // 0 <= leftover < n
  remainders.sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  for (let i = 0; i < remainders.length && leftover > 0n; i++, leftover--) {
    result[remainders[i].index] += 1n;
  }
  return result;
}
