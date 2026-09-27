"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrder = void 0;
const allocate_1 = require("./allocate");
const decimal_1 = require("./decimal");
const store_1 = require("./store");
const RATE_SCALE = 10000n; // 税率/百分比本身放大 10^4（最多4位小数）
const PERCENT_SCALE = 100n; // 百分比最多2位小数，先放大 10^2
const HUNDRED = 100n;
function assert(cond, message) {
    if (!cond)
        throw new Error(message);
}
function validateLines(lines) {
    assert(Array.isArray(lines) && lines.length > 0, 'lines must be a non-empty array');
    const seen = new Set();
    for (const line of lines) {
        assert(typeof line.lineId === 'string' && line.lineId.length > 0, 'lineId must be a non-empty string');
        assert(!seen.has(line.lineId), `duplicate lineId: ${line.lineId}`);
        seen.add(line.lineId);
        assert(typeof line.unitPrice === 'bigint' && line.unitPrice >= 0n, 'unitPrice must be a non-negative bigint');
        assert(typeof line.quantity === 'bigint' && line.quantity >= 1n, 'quantity must be a positive bigint');
    }
}
/** 解析税率字符串，返回放大 10^4 倍的整数（如 "8.875" -> 88875） */
function parseTaxRate(taxRate) {
    const scaled = (0, decimal_1.parseDecimalScaled)(taxRate, 4, RATE_SCALE);
    assert(scaled !== null, `invalid taxRate: ${String(taxRate)}`);
    assert(scaled <= HUNDRED * RATE_SCALE, `taxRate out of range: ${taxRate}`);
    return scaled;
}
/** 计算折扣额 D（分） */
function computeDiscount(discount, subtotal) {
    if (discount === undefined)
        return 0n;
    if (discount.type === 'percent') {
        const pctScaled = (0, decimal_1.parseDecimalScaled)(discount.percent, 2, PERCENT_SCALE);
        assert(pctScaled !== null, `invalid discount percent: ${String(discount.percent)}`);
        assert(pctScaled <= HUNDRED * PERCENT_SCALE, `discount percent out of range: ${discount.percent}`);
        // D = round(S * pct / 100)，pct 已放大 10^2，故分母为 10^4
        return (0, decimal_1.divRoundHalfUp)(subtotal * pctScaled, RATE_SCALE);
    }
    assert(discount.type === 'fixed', 'unknown discount type');
    assert(typeof discount.amount === 'bigint' && discount.amount >= 0n, 'fixed discount amount must be a non-negative bigint');
    return discount.amount < subtotal ? discount.amount : subtotal;
}
function createOrder(lines, taxRate, discount) {
    validateLines(lines);
    const rateScaled = parseTaxRate(taxRate);
    const subtotals = lines.map((l) => l.unitPrice * l.quantity);
    const subtotal = subtotals.reduce((a, b) => a + b, 0n);
    const discountTotal = computeDiscount(discount, subtotal);
    // 税对整单只算一次：T = round((S - D) * rate)
    const taxTotal = (0, decimal_1.divRoundHalfUp)((subtotal - discountTotal) * rateScaled, HUNDRED * RATE_SCALE);
    const lineIds = lines.map((l) => l.lineId);
    const lineDiscounts = (0, allocate_1.allocate)(discountTotal, subtotals, lineIds);
    const lineTaxables = subtotals.map((s, i) => s - lineDiscounts[i]);
    const lineTaxes = (0, allocate_1.allocate)(taxTotal, lineTaxables, lineIds);
    const storedLines = lines.map((l, i) => ({
        lineId: l.lineId,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        subtotal: subtotals[i],
        discount: lineDiscounts[i],
        tax: lineTaxes[i],
        refundedQuantity: 0n,
        refundedGoods: 0n,
        refundedDiscount: 0n,
        refundedTax: 0n,
    }));
    const orderId = (0, store_1.nextOrderId)();
    (0, store_1.saveOrder)({
        orderId,
        lines: storedLines,
        lineIndex: new Map(storedLines.map((l, i) => [l.lineId, i])),
        subtotal,
        discountTotal,
        taxTotal,
        total: subtotal - discountTotal + taxTotal,
        refundCount: 0,
    });
    return orderId;
}
exports.createOrder = createOrder;
