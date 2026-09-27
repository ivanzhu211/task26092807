import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOrder, getOrder, refundRemaining, refundUnits, _resetStoreForTests, OrderLineInput } from '../src/index';

test('10^5 lines and near-max quantities complete quickly', () => {
  _resetStoreForTests();
  const lines: OrderLineInput[] = [];
  for (let i = 0; i < 100_000; i++) {
    lines.push({ lineId: `L${i}`, unitPrice: 1_000_000_000n, quantity: 1_000_000_000n });
  }
  const start = Date.now();
  const id = createOrder(lines, '8.875', { type: 'percent', percent: '12.34' });
  // 一次退 1000 行，开销只与本次请求行数有关
  const items = [];
  for (let i = 0; i < 1000; i++) items.push({ lineId: `L${i * 100}`, quantity: 999_999_999n });
  refundUnits(id, items);
  refundRemaining(id);
  const elapsed = Date.now() - start;
  const view = getOrder(id);
  assert.equal(view.status, 'full');
  assert.equal(view.refunded.total, view.payable.total);
  assert.ok(elapsed < 10_000, `took ${elapsed}ms`);
});
