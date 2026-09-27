"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const index_1 = require("../src/index");
(0, node_test_1.test)('10^5 lines and near-max quantities complete quickly', () => {
    (0, index_1._resetStoreForTests)();
    const lines = [];
    for (let i = 0; i < 100000; i++) {
        lines.push({ lineId: `L${i}`, unitPrice: 1000000000n, quantity: 1000000000n });
    }
    const start = Date.now();
    const id = (0, index_1.createOrder)(lines, '8.875', { type: 'percent', percent: '12.34' });
    // 一次退 1000 行，开销只与本次请求行数有关
    const items = [];
    for (let i = 0; i < 1000; i++)
        items.push({ lineId: `L${i * 100}`, quantity: 999999999n });
    (0, index_1.refundUnits)(id, items);
    (0, index_1.refundRemaining)(id);
    const elapsed = Date.now() - start;
    const view = (0, index_1.getOrder)(id);
    strict_1.default.equal(view.status, 'full');
    strict_1.default.equal(view.refunded.total, view.payable.total);
    strict_1.default.ok(elapsed < 10000, `took ${elapsed}ms`);
});
