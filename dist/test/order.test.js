"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const index_1 = require("../src/index");
(0, node_test_1.test)('basic order without discount', () => {
    (0, index_1._resetStoreForTests)();
    const id = (0, index_1.createOrder)([
        { lineId: 'a', unitPrice: 1000n, quantity: 2n },
        { lineId: 'b', unitPrice: 500n, quantity: 1n },
    ], '10');
    const o = (0, index_1.getOrder)(id);
    strict_1.default.equal(o.payable.subtotal, 2500n);
    strict_1.default.equal(o.payable.discount, 0n);
    strict_1.default.equal(o.payable.tax, 250n);
    strict_1.default.equal(o.payable.total, 2750n);
    strict_1.default.equal(o.status, 'none');
    strict_1.default.equal(o.lines[0].payable.tax, 200n);
    strict_1.default.equal(o.lines[1].payable.tax, 50n);
});
(0, node_test_1.test)('tax rounds half up, computed once on whole order', () => {
    (0, index_1._resetStoreForTests)();
    // (S-D) * 0.0001% / 100 = 500000 * 1 / 1e6 = 0.5 -> 1
    const id = (0, index_1.createOrder)([{ lineId: 'a', unitPrice: 500000n, quantity: 1n }], '0.0001');
    strict_1.default.equal((0, index_1.getOrder)(id).payable.tax, 1n);
    // 0.4 -> 0
    const id2 = (0, index_1.createOrder)([{ lineId: 'a', unitPrice: 400000n, quantity: 1n }], '0.0001');
    strict_1.default.equal((0, index_1.getOrder)(id2).payable.tax, 0n);
});
(0, node_test_1.test)('percent discount rounds half up', () => {
    (0, index_1._resetStoreForTests)();
    // S=105, 50% -> 52.5 -> 53
    const id = (0, index_1.createOrder)([{ lineId: 'a', unitPrice: 105n, quantity: 1n }], '0', {
        type: 'percent',
        percent: '50',
    });
    strict_1.default.equal((0, index_1.getOrder)(id).payable.discount, 53n);
});
(0, node_test_1.test)('fixed discount capped at subtotal', () => {
    (0, index_1._resetStoreForTests)();
    const id = (0, index_1.createOrder)([{ lineId: 'a', unitPrice: 100n, quantity: 1n }], '10', {
        type: 'fixed',
        amount: 99999n,
    });
    const o = (0, index_1.getOrder)(id);
    strict_1.default.equal(o.payable.discount, 100n);
    strict_1.default.equal(o.payable.tax, 0n);
    strict_1.default.equal(o.payable.total, 0n);
});
(0, node_test_1.test)('zero subtotal order does not divide by zero', () => {
    (0, index_1._resetStoreForTests)();
    const id = (0, index_1.createOrder)([
        { lineId: 'a', unitPrice: 0n, quantity: 5n },
        { lineId: 'b', unitPrice: 0n, quantity: 3n },
    ], '8.875', { type: 'percent', percent: '50' });
    const o = (0, index_1.getOrder)(id);
    strict_1.default.equal(o.payable.total, 0n);
    const r = (0, index_1.refundRemaining)(id);
    strict_1.default.equal(r.total, 0n);
    strict_1.default.equal((0, index_1.getOrder)(id).status, 'full');
});
(0, node_test_1.test)('allocation sums exactly and is order-independent with tied remainders', () => {
    (0, index_1._resetStoreForTests)();
    // S=300, 10% discount -> D=30; lines 100/100/100 -> each exactly 10 (no tie).
    // Use S=3 with three lines of 1 cent and fixed discount 2 -> remainders tie at 2/3.
    const lines = [
        { lineId: 'x', unitPrice: 1n, quantity: 1n },
        { lineId: 'y', unitPrice: 1n, quantity: 1n },
        { lineId: 'z', unitPrice: 1n, quantity: 1n },
    ];
    const discount = { type: 'fixed', amount: 2n };
    const id1 = (0, index_1.createOrder)(lines, '0', discount);
    const id2 = (0, index_1.createOrder)([lines[2], lines[0], lines[1]], '0', discount);
    const id3 = (0, index_1.createOrder)([lines[1], lines[2], lines[0]], '0', discount);
    const byId = (id) => new Map((0, index_1.getOrder)(id).lines.map((l) => [l.lineId, l]));
    const m1 = byId(id1);
    const m2 = byId(id2);
    const m3 = byId(id3);
    for (const key of ['x', 'y', 'z']) {
        strict_1.default.equal(m1.get(key).payable.discount, m2.get(key).payable.discount);
        strict_1.default.equal(m1.get(key).payable.discount, m3.get(key).payable.discount);
        strict_1.default.equal(m1.get(key).payable.tax, m2.get(key).payable.tax);
    }
    const total = (0, index_1.getOrder)(id1).lines.reduce((a, l) => a + l.payable.discount, 0n);
    strict_1.default.equal(total, 2n);
    // 余数相等时按 lineId 字典序：x、y 各得 1，z 得 0
    strict_1.default.equal(m1.get('x').payable.discount, 1n);
    strict_1.default.equal(m1.get('y').payable.discount, 1n);
    strict_1.default.equal(m1.get('z').payable.discount, 0n);
});
(0, node_test_1.test)('invalid tax rates rejected', () => {
    (0, index_1._resetStoreForTests)();
    const lines = [{ lineId: 'a', unitPrice: 1n, quantity: 1n }];
    for (const bad of ['', '-1', '1e2', '0.12345', '100.0001', '101', 'abc', '1.', '.1', ' 1', '1 ']) {
        strict_1.default.throws(() => (0, index_1.createOrder)(lines, bad), new RegExp(''), `should reject ${JSON.stringify(bad)}`);
    }
    for (const ok of ['0', '100', '8.875', '0.0001', '99.9999']) {
        strict_1.default.doesNotThrow(() => (0, index_1.createOrder)(lines, ok));
    }
});
(0, node_test_1.test)('invalid discount percent rejected', () => {
    (0, index_1._resetStoreForTests)();
    const lines = [{ lineId: 'a', unitPrice: 1n, quantity: 1n }];
    for (const bad of ['', '-5', '1e1', '0.123', '100.01', '101']) {
        strict_1.default.throws(() => (0, index_1.createOrder)(lines, '0', { type: 'percent', percent: bad }));
    }
    strict_1.default.doesNotThrow(() => (0, index_1.createOrder)(lines, '0', { type: 'percent', percent: '33.33' }));
});
(0, node_test_1.test)('invalid lines rejected', () => {
    (0, index_1._resetStoreForTests)();
    strict_1.default.throws(() => (0, index_1.createOrder)([], '0'));
    strict_1.default.throws(() => (0, index_1.createOrder)([
        { lineId: 'a', unitPrice: 1n, quantity: 1n },
        { lineId: 'a', unitPrice: 2n, quantity: 1n },
    ], '0'));
    strict_1.default.throws(() => (0, index_1.createOrder)([{ lineId: 'a', unitPrice: -1n, quantity: 1n }], '0'));
    strict_1.default.throws(() => (0, index_1.createOrder)([{ lineId: 'a', unitPrice: 1n, quantity: 0n }], '0'));
});
(0, node_test_1.test)('refund merges duplicate lineIds and is atomic on failure', () => {
    (0, index_1._resetStoreForTests)();
    const id = (0, index_1.createOrder)([
        { lineId: 'a', unitPrice: 100n, quantity: 5n },
        { lineId: 'b', unitPrice: 200n, quantity: 2n },
    ], '10');
    const r = (0, index_1.refundUnits)(id, [
        { lineId: 'a', quantity: 1n },
        { lineId: 'a', quantity: 2n },
    ]);
    strict_1.default.equal(r.lines.length, 1);
    strict_1.default.equal(r.lines[0].quantity, 3n);
    strict_1.default.equal(r.lines[0].goods, 300n);
    // 超量：整个请求拒绝，不留部分效果
    strict_1.default.throws(() => (0, index_1.refundUnits)(id, [
        { lineId: 'a', quantity: 1n },
        { lineId: 'b', quantity: 3n },
    ]));
    // 未知行：整个请求拒绝
    strict_1.default.throws(() => (0, index_1.refundUnits)(id, [
        { lineId: 'a', quantity: 1n },
        { lineId: 'nope', quantity: 1n },
    ]));
    // 非正整数
    strict_1.default.throws(() => (0, index_1.refundUnits)(id, [{ lineId: 'a', quantity: 0n }]));
    const o = (0, index_1.getOrder)(id);
    strict_1.default.equal(o.lines.find((l) => l.lineId === 'a').refunded.quantity, 3n);
    strict_1.default.equal(o.lines.find((l) => l.lineId === 'b').refunded.quantity, 0n);
    strict_1.default.equal(o.status, 'partial');
});
(0, node_test_1.test)('full refund equals payable exactly', () => {
    (0, index_1._resetStoreForTests)();
    const id = (0, index_1.createOrder)([
        { lineId: 'a', unitPrice: 333n, quantity: 7n },
        { lineId: 'b', unitPrice: 111n, quantity: 3n },
    ], '8.875', { type: 'percent', percent: '12.5' });
    (0, index_1.refundUnits)(id, [{ lineId: 'a', quantity: 4n }]);
    (0, index_1.refundRemaining)(id);
    const o = (0, index_1.getOrder)(id);
    strict_1.default.equal(o.status, 'full');
    for (const line of o.lines) {
        strict_1.default.equal(line.refunded.subtotal, line.payable.subtotal);
        strict_1.default.equal(line.refunded.discount, line.payable.discount);
        strict_1.default.equal(line.refunded.tax, line.payable.tax);
        strict_1.default.equal(line.refunded.total, line.payable.total);
    }
    strict_1.default.equal(o.refunded.total, o.payable.total);
});
