/**
 * 解析非负十进制字符串（如 "8.875"），返回放大 scale 倍后的整数值。
 * 拒绝：空串、负号、科学计数法、非数字字符、小数位超过 maxDecimals。
 * 解析过程只用整数运算，不经过浮点。
 */
export declare function parseDecimalScaled(s: string, maxDecimals: number, scale: bigint): bigint | null;
/** 四舍五入（恰好一半时进位）计算 round(a/b)，要求 a>=0, b>0 */
export declare function divRoundHalfUp(a: bigint, b: bigint): bigint;
