/**
 * 最大余数法分摊：把 total 按 weights 比例分摊。
 * 每份是精确值 total*weight[i]/weightSum 的 floor 或 ceil，各份之和恰为 total。
 * 余数相等时按 keys 的字典序（code unit 比较）决定先后，
 * 因此结果只取决于 (key, weight) 集合，与传入顺序无关。
 * total 为 0 或权重和为 0 时全部返回 0（避免除零）。
 */
export declare function allocate(total: bigint, weights: bigint[], keys: string[]): bigint[];
