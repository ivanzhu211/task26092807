import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createOrder,
  getOrder,
  refundRemaining,
  refundUnits,
  _resetStoreForTests,
} from '../src/index';

test('basic order without discount', () => {
  _resetStoreForTests();
  const id = createOrder(
    [
      { lineId: 'a', unitPrice: 1000n, quantity: 2n },
      { lineId: 'b', unitPrice: 500n, quantity: 1n },
    ],
    '10',
  );
  const o = getOrder(id);
  assert.equal(o.payable.subtotal, 2500n);
  assert.equal(o.payable.discount, 0n);
  assert.equal(o.payable.tax, 250n);
  assert.equal(o.payable.total, 2750n);
  assert.equal(o.status, 'none');
  assert.equal(o.lines[0].payable.tax, 200n);
  assert.equal(o.lines[1].payable.tax, 50n);
});

test('tax rounds half up, computed once on whole order', () => {
  _resetStoreForTests();
  // (S-D) * 0.0001% / 100 = 500000 * 1 / 1e6 = 0.5 -> 1
  const id = createOrder([{ lineId: 'a', unitPrice: 500000n, quantity: 1n }], '0.0001');
  assert.equal(getOrder(id).payable.tax, 1n);
  // 0.4 -> 0
  const id2 = createOrder([{ lineId: 'a', unitPrice: 400000n, quantity: 1n }], '0.0001');
  assert.equal(getOrder(id2).payable.tax, 0n);
});

test('percent discount rounds half up', () => {
  _resetStoreForTests();
  // S=105, 50% -> 52.5 -> 53
  const id = createOrder([{ lineId: 'a', unitPrice: 105n, quantity: 1n }], '0', {
    type: 'percent',
    percent: '50',
  });
  assert.equal(getOrder(id).payable.discount, 53n);
});

test('fixed discount capped at subtotal', () => {
  _resetStoreForTests();
  const id = createOrder([{ lineId: 'a', unitPrice: 100n, quantity: 1n }], '10', {
    type: 'fixed',
    amount: 99999n,
  });
  const o = getOrder(id);
  assert.equal(o.payable.discount, 100n);
  assert.equal(o.payable.tax, 0n);
  assert.equal(o.payable.total, 0n);
});

test('zero subtotal order does not divide by zero', () => {
  _resetStoreForTests();
  const id = createOrder(
    [
      { lineId: 'a', unitPrice: 0n, quantity: 5n },
      { lineId: 'b', unitPrice: 0n, quantity: 3n },
    ],
    '8.875',
    { type: 'percent', percent: '50' },
  );
  const o = getOrder(id);
  assert.equal(o.payable.total, 0n);
  const r = refundRemaining(id);
  assert.equal(r.total, 0n);
  assert.equal(getOrder(id).status, 'full');
});

test('allocation sums exactly and is order-independent with tied remainders', () => {
  _resetStoreForTests();
  // S=300, 10% discount -> D=30; lines 100/100/100 -> each exactly 10 (no tie).
  // Use S=3 with three lines of 1 cent and fixed discount 2 -> remainders tie at 2/3.
  const lines = [
    { lineId: 'x', unitPrice: 1n, quantity: 1n },
    { lineId: 'y', unitPrice: 1n, quantity: 1n },
    { lineId: 'z', unitPrice: 1n, quantity: 1n },
  ];
  const discount = { type: 'fixed', amount: 2n } as const;
  const id1 = createOrder(lines, '0', discount);
  const id2 = createOrder([lines[2], lines[0], lines[1]], '0', discount);
  const id3 = createOrder([lines[1], lines[2], lines[0]], '0', discount);
  const byId = (id: string) => new Map(getOrder(id).lines.map((l) => [l.lineId, l]));
  const m1 = byId(id1);
  const m2 = byId(id2);
  const m3 = byId(id3);
  for (const key of ['x', 'y', 'z']) {
    assert.equal(m1.get(key)!.payable.discount, m2.get(key)!.payable.discount);
    assert.equal(m1.get(key)!.payable.discount, m3.get(key)!.payable.discount);
    assert.equal(m1.get(key)!.payable.tax, m2.get(key)!.payable.tax);
  }
  const total = getOrder(id1).lines.reduce((a, l) => a + l.payable.discount, 0n);
  assert.equal(total, 2n);
  // 余数相等时按 lineId 字典序：x、y 各得 1，z 得 0
  assert.equal(m1.get('x')!.payable.discount, 1n);
  assert.equal(m1.get('y')!.payable.discount, 1n);
  assert.equal(m1.get('z')!.payable.discount, 0n);
});

test('invalid tax rates rejected', () => {
  _resetStoreForTests();
  const lines = [{ lineId: 'a', unitPrice: 1n, quantity: 1n }];
  for (const bad of ['', '-1', '1e2', '0.12345', '100.0001', '101', 'abc', '1.', '.1', ' 1', '1 ']) {
    assert.throws(() => createOrder(lines, bad), new RegExp(''), `should reject ${JSON.stringify(bad)}`);
  }
  for (const ok of ['0', '100', '8.875', '0.0001', '99.9999']) {
    assert.doesNotThrow(() => createOrder(lines, ok));
  }
});

test('invalid discount percent rejected', () => {
  _resetStoreForTests();
  const lines = [{ lineId: 'a', unitPrice: 1n, quantity: 1n }];
  for (const bad of ['', '-5', '1e1', '0.123', '100.01', '101']) {
    assert.throws(() => createOrder(lines, '0', { type: 'percent', percent: bad }));
  }
  assert.doesNotThrow(() => createOrder(lines, '0', { type: 'percent', percent: '33.33' }));
});

test('invalid lines rejected', () => {
  _resetStoreForTests();
  assert.throws(() => createOrder([], '0'));
  assert.throws(() =>
    createOrder(
      [
        { lineId: 'a', unitPrice: 1n, quantity: 1n },
        { lineId: 'a', unitPrice: 2n, quantity: 1n },
      ],
      '0',
    ),
  );
  assert.throws(() => createOrder([{ lineId: 'a', unitPrice: -1n, quantity: 1n }], '0'));
  assert.throws(() => createOrder([{ lineId: 'a', unitPrice: 1n, quantity: 0n }], '0'));
});

test('refund merges duplicate lineIds and is atomic on failure', () => {
  _resetStoreForTests();
  const id = createOrder(
    [
      { lineId: 'a', unitPrice: 100n, quantity: 5n },
      { lineId: 'b', unitPrice: 200n, quantity: 2n },
    ],
    '10',
  );
  const r = refundUnits(id, [
    { lineId: 'a', quantity: 1n },
    { lineId: 'a', quantity: 2n },
  ]);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].quantity, 3n);
  assert.equal(r.lines[0].goods, 300n);

  // 超量：整个请求拒绝，不留部分效果
  assert.throws(() =>
    refundUnits(id, [
      { lineId: 'a', quantity: 1n },
      { lineId: 'b', quantity: 3n },
    ]),
  );
  // 未知行：整个请求拒绝
  assert.throws(() =>
    refundUnits(id, [
      { lineId: 'a', quantity: 1n },
      { lineId: 'nope', quantity: 1n },
    ]),
  );
  // 非正整数
  assert.throws(() => refundUnits(id, [{ lineId: 'a', quantity: 0n }]));
  const o = getOrder(id);
  assert.equal(o.lines.find((l) => l.lineId === 'a')!.refunded.quantity, 3n);
  assert.equal(o.lines.find((l) => l.lineId === 'b')!.refunded.quantity, 0n);
  assert.equal(o.status, 'partial');
});

test('full refund equals payable exactly', () => {
  _resetStoreForTests();
  const id = createOrder(
    [
      { lineId: 'a', unitPrice: 333n, quantity: 7n },
      { lineId: 'b', unitPrice: 111n, quantity: 3n },
    ],
    '8.875',
    { type: 'percent', percent: '12.5' },
  );
  refundUnits(id, [{ lineId: 'a', quantity: 4n }]);
  refundRemaining(id);
  const o = getOrder(id);
  assert.equal(o.status, 'full');
  for (const line of o.lines) {
    assert.equal(line.refunded.subtotal, line.payable.subtotal);
    assert.equal(line.refunded.discount, line.payable.discount);
    assert.equal(line.refunded.tax, line.payable.tax);
    assert.equal(line.refunded.total, line.payable.total);
  }
  assert.equal(o.refunded.total, o.payable.total);
});
