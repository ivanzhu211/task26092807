"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrder = exports.refundRemaining = exports.refundUnits = void 0;
const decimal_1 = require("./decimal");
const store_1 = require("./store");
function assert(cond, message) {
    if (!cond)
        throw new Error(message);
}
function getOrderOrThrow(orderId) {
    const order = (0, store_1.findOrder)(orderId);
    assert(order !== undefined, `order not found: ${orderId}`);
    return order;
}
/**
 * 累计退款曲线：某行某分项份额为 share、共 n 件，退到第 k 件时累计应退
 * round(share * k / n)（半分进位）。只取决于 k，与退款路径无关；
 * 与精确值之差 <= 0.5 分 < 1 分；k=n 时恰为 share。
 */
function cumulative(share, k, n) {
    return (0, decimal_1.divRoundHalfUp)(share * k, n);
}
function applyRefund(order, merged) {
    order.refundCount += 1;
    const lines = [];
    for (const [lineId, qty] of merged) {
        const line = order.lines[order.lineIndex.get(lineId)];
        const kBefore = line.refundedQuantity;
        const kAfter = kBefore + qty;
        const goods = line.unitPrice * qty;
        const discount = cumulative(line.discount, kAfter, line.quantity) - cumulative(line.discount, kBefore, line.quantity);
        const tax = cumulative(line.tax, kAfter, line.quantity) - cumulative(line.tax, kBefore, line.quantity);
        line.refundedQuantity = kAfter;
        line.refundedGoods += goods;
        line.refundedDiscount += discount;
        line.refundedTax += tax;
        lines.push({ lineId, quantity: qty, goods, discount, tax, total: goods - discount + tax });
    }
    const sum = (f) => lines.reduce((a, l) => a + f(l), 0n);
    return {
        refundId: `${order.orderId}_ref_${order.refundCount}`,
        orderId: order.orderId,
        lines,
        goods: sum((l) => l.goods),
        discount: sum((l) => l.discount),
        tax: sum((l) => l.tax),
        total: sum((l) => l.total),
    };
}
/** 合并重复 lineId 并校验；任何一项非法直接抛错，不产生部分效果 */
function validateItems(order, items) {
    assert(Array.isArray(items) && items.length > 0, 'items must be a non-empty array');
    const merged = new Map();
    for (const item of items) {
        assert(typeof item.lineId === 'string', 'lineId must be a string');
        assert(typeof item.quantity === 'bigint' && item.quantity >= 1n, 'refund quantity must be a positive bigint');
        merged.set(item.lineId, (merged.get(item.lineId) ?? 0n) + item.quantity);
    }
    for (const [lineId, qty] of merged) {
        const index = order.lineIndex.get(lineId);
        assert(index !== undefined, `unknown lineId: ${lineId}`);
        const line = order.lines[index];
        assert(qty <= line.quantity - line.refundedQuantity, `refund quantity exceeds remaining for lineId: ${lineId}`);
    }
    return merged;
}
function refundUnits(orderId, items) {
    const order = getOrderOrThrow(orderId);
    const merged = validateItems(order, items);
    return applyRefund(order, merged);
}
exports.refundUnits = refundUnits;
function refundRemaining(orderId) {
    const order = getOrderOrThrow(orderId);
    const merged = new Map();
    for (const line of order.lines) {
        const remaining = line.quantity - line.refundedQuantity;
        if (remaining > 0n)
            merged.set(line.lineId, remaining);
    }
    return applyRefund(order, merged);
}
exports.refundRemaining = refundRemaining;
function getOrder(orderId) {
    const order = getOrderOrThrow(orderId);
    let refundedAny = false;
    let refundedAll = true;
    const lines = order.lines.map((line) => {
        const remaining = line.quantity - line.refundedQuantity;
        if (line.refundedQuantity > 0n)
            refundedAny = true;
        if (remaining > 0n)
            refundedAll = false;
        return {
            lineId: line.lineId,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            payable: {
                subtotal: line.subtotal,
                discount: line.discount,
                tax: line.tax,
                total: line.subtotal - line.discount + line.tax,
            },
            refunded: {
                quantity: line.refundedQuantity,
                subtotal: line.refundedGoods,
                discount: line.refundedDiscount,
                tax: line.refundedTax,
                total: line.refundedGoods - line.refundedDiscount + line.refundedTax,
            },
            remainingQuantity: remaining,
        };
    });
    const status = !refundedAny ? 'none' : refundedAll ? 'full' : 'partial';
    const sumRef = (f) => order.lines.reduce((a, l) => a + f(l), 0n);
    return {
        orderId: order.orderId,
        status,
        lines,
        payable: {
            subtotal: order.subtotal,
            discount: order.discountTotal,
            tax: order.taxTotal,
            total: order.total,
        },
        refunded: {
            subtotal: sumRef((l) => l.refundedGoods),
            discount: sumRef((l) => l.refundedDiscount),
            tax: sumRef((l) => l.refundedTax),
            total: sumRef((l) => l.refundedGoods - l.refundedDiscount + l.refundedTax),
        },
    };
}
exports.getOrder = getOrder;
