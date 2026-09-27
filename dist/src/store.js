"use strict";
/** 内存订单存储（内部实现细节，不对外暴露） */
Object.defineProperty(exports, "__esModule", { value: true });
exports._resetStoreForTests = exports.findOrder = exports.saveOrder = exports.nextOrderId = void 0;
const orders = new Map();
let orderSeq = 0;
function nextOrderId() {
    orderSeq += 1;
    return `ord_${orderSeq}`;
}
exports.nextOrderId = nextOrderId;
function saveOrder(order) {
    orders.set(order.orderId, order);
}
exports.saveOrder = saveOrder;
function findOrder(orderId) {
    return orders.get(orderId);
}
exports.findOrder = findOrder;
function _resetStoreForTests() {
    orders.clear();
    orderSeq = 0;
}
exports._resetStoreForTests = _resetStoreForTests;
