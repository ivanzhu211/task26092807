import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createOrder,
  getOrder,
  refundRemaining,
  refundUnits,
  _resetStoreForTests,
  Discount,
  OrderLineInput,
  OrderView,
  RefundItemInput,
} from '../src/index';

/** 可复现的伪随机数发生器 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randBig(rand: () => number, lo: bigint, hi: bigint): bigint {
  // 仅用于 hi-lo < 2^53 的场景
  const span = hi - lo + 1n;
  return lo + BigInt(Math.floor(rand() * Number(span)));
}

function randomTaxRate(rand: () => number): string {
  const intPart = Math.floor(rand() * 101);
  const decPlaces = Math.floor(rand() * 5); // 0~4 位小数
  if (decPlaces === 0 || intPart === 100) return String(intPart);
  let frac = '';
  for (let i = 0; i < decPlaces; i++) frac += Math.floor(rand() * 10);
  return `${intPart}.${frac}`;
}

interface GeneratedOrder {
  lines: OrderLineInput[];
  taxRate: string;
  discount?: Discount;
  tag: string;
}

function generateOrder(rand: () => number, variant: number): GeneratedOrder {
  const lineCount = 1 + Math.floor(rand() * 20);
  const lines: OrderLineInput[] = [];
  for (let i = 0; i < lineCount; i++) {
    let unitPrice: bigint;
    let quantity: bigint;
    if (variant === 0 && i === 0) {
      unitPrice = 0n; // 0 元行
      quantity = randBig(rand, 1n, 1000n);
    } else if (variant === 4 && i === 0) {
      quantity = 1_000_000_000n - BigInt(Math.floor(rand() * 10)); // 数量接近上限
      unitPrice = randBig(rand, 1n, 1_000_000_000n);
    } else {
      unitPrice = randBig(rand, 0n, 1_000_000n);
      quantity = randBig(rand, 1n, 1000n);
    }
    lines.push({ lineId: `L${i}`, unitPrice, quantity });
  }

  let taxRate = randomTaxRate(rand);
  let discount: Discount | undefined;
  let tag = 'generic';

  const subtotal = lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0n);
  switch (variant) {
    case 0:
      tag = 'zero-price-line';
      break;
    case 1: {
      // 折扣等于小计：固定面额 == S
      discount = { type: 'fixed', amount: subtotal };
      tag = 'discount-equals-subtotal-fixed';
      break;
    }
    case 2: {
      // 折扣等于小计：百分比 100%
      discount = { type: 'percent', percent: '100' };
      tag = 'discount-equals-subtotal-percent';
      break;
    }
    case 3: {
      // 4 位小数税率
      taxRate = `${Math.floor(rand() * 100)}.${Math.floor(rand() * 10)}${Math.floor(rand() * 10)}${Math.floor(rand() * 10)}${Math.floor(rand() * 10)}`;
      tag = 'four-decimal-tax';
      break;
    }
    case 4:
      tag = 'near-max-quantity';
      break;
    case 5: {
      // 税额精确值恰好落在半分上：rate=0.0001 -> T = S*1/1e6，令 S ≡ 500000 (mod 1e6)
      taxRate = '0.0001';
      const base = randBig(rand, 0n, 999n) * 1_000_000n + 500_000n;
      lines.length = 0;
      lines.push({ lineId: 'L0', unitPrice: base, quantity: 1n });
      discount = undefined;
      tag = 'half-cent-tax';
      break;
    }
    default: {
      if (rand() < 0.5) {
        const pctInt = Math.floor(rand() * 101);
        const pct = rand() < 0.5 ? String(pctInt) : `${pctInt}.${Math.floor(rand() * 10)}${Math.floor(rand() * 10)}`;
        discount = { type: 'percent', percent: pct };
      } else {
        discount = { type: 'fixed', amount: randBig(rand, 0n, subtotal > 0n ? subtotal : 0n) };
      }
    }
  }
  return { lines, taxRate, discount, tag };
}

/** 校验分摊性质：每份是精确值的 floor/ceil，总和恰为总额 */
function checkAllocation(view: OrderView): void {
  const S = view.payable.subtotal;
  const D = view.payable.discount;
  const T = view.payable.tax;
  const base = S - D;
  let sumD = 0n;
  let sumT = 0n;
  for (const line of view.lines) {
    sumD += line.payable.discount;
    sumT += line.payable.tax;
    if (S > 0n) {
      const floor = (D * line.payable.subtotal) / S;
      assert.ok(
        line.payable.discount === floor || line.payable.discount === floor + 1n,
        `line discount must be floor/ceil of exact share`,
      );
    } else {
      assert.equal(line.payable.discount, 0n);
    }
    const taxable = line.payable.subtotal - line.payable.discount;
    if (base > 0n) {
      const floor = (T * taxable) / base;
      assert.ok(line.payable.tax === floor || line.payable.tax === floor + 1n, 'line tax must be floor/ceil');
    } else {
      assert.equal(line.payable.tax, 0n);
    }
  }
  assert.equal(sumD, D, 'line discounts sum to D');
  assert.equal(sumT, T, 'line taxes sum to T');
}

/** 校验某时刻累计退款的全部性质，并与一次性退同样件数的孪生订单逐分对比 */
function checkCumulative(
  view: OrderView,
  spec: GeneratedOrder,
): void {
  for (const line of view.lines) {
    const k = line.refunded.quantity;
    const n = line.quantity;
    // 累计商品额恰为 单价×已退件数
    assert.equal(line.refunded.subtotal, line.unitPrice * k, 'cumulative goods exact');
    // 累计折扣/税与精确值之差 < 1 分：|cum*n - share*k| < n
    const dDiff = line.refunded.discount * n - line.payable.discount * k;
    const tDiff = line.refunded.tax * n - line.payable.tax * k;
    assert.ok(dDiff < n && dDiff > -n, 'cumulative discount within 1 cent of exact');
    assert.ok(tDiff < n && tDiff > -n, 'cumulative tax within 1 cent of exact');
    // 各分项不超过应付
    assert.ok(line.refunded.subtotal <= line.payable.subtotal, 'goods <= payable');
    assert.ok(line.refunded.discount <= line.payable.discount, 'discount <= payable');
    assert.ok(line.refunded.tax <= line.payable.tax, 'tax <= payable');
    assert.ok(line.refunded.total <= line.payable.total, 'total <= payable');
  }

  // 路径无关：另建相同订单，一次性退掉每行累计件数，逐分相同
  const twinId = createOrder(spec.lines, spec.taxRate, spec.discount);
  const items: RefundItemInput[] = view.lines
    .filter((l) => l.refunded.quantity > 0n)
    .map((l) => ({ lineId: l.lineId, quantity: l.refunded.quantity }));
  if (items.length > 0) refundUnits(twinId, items);
  const twin = getOrder(twinId);
  for (const line of view.lines) {
    const t = twin.lines.find((l) => l.lineId === line.lineId)!;
    assert.equal(t.refunded.subtotal, line.refunded.subtotal, `twin goods ${line.lineId}`);
    assert.equal(t.refunded.discount, line.refunded.discount, `twin discount ${line.lineId}`);
    assert.equal(t.refunded.tax, line.refunded.tax, `twin tax ${line.lineId}`);
    assert.equal(t.refunded.total, line.refunded.total, `twin total ${line.lineId}`);
  }
}

function runRandomRefundSequence(rand: () => number, spec: GeneratedOrder): void {
  const orderId = createOrder(spec.lines, spec.taxRate, spec.discount);
  checkAllocation(getOrder(orderId));

  const remaining = new Map<string, bigint>(spec.lines.map((l) => [l.lineId, l.quantity]));
  const steps = 2 + Math.floor(rand() * 8);
  for (let step = 0; step < steps; step++) {
    const available = [...remaining.entries()].filter(([, q]) => q > 0n);
    if (available.length === 0) break;
    // 随机打乱后取前若干个行，多行混在一个请求里
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    const take = 1 + Math.floor(rand() * available.length);
    const items: RefundItemInput[] = [];
    for (const [lineId, rem] of available.slice(0, take)) {
      const qty = randBig(rand, 1n, rem); // 随机拆分件数
      items.push({ lineId, quantity: qty });
      remaining.set(lineId, rem - qty);
    }
    const result = refundUnits(orderId, items);
    // 每次退款的每个分项和合计都不为负
    for (const line of result.lines) {
      assert.ok(line.goods >= 0n && line.discount >= 0n && line.tax >= 0n && line.total >= 0n, 'refund non-negative');
    }
    assert.ok(result.goods >= 0n && result.discount >= 0n && result.tax >= 0n && result.total >= 0n);
    checkCumulative(getOrder(orderId), spec);
  }

  refundRemaining(orderId);
  const finalView = getOrder(orderId);
  assert.equal(finalView.status, 'full');
  // 全部退完：累计退款逐分等于实付
  for (const line of finalView.lines) {
    assert.equal(line.refunded.subtotal, line.payable.subtotal);
    assert.equal(line.refunded.discount, line.payable.discount);
    assert.equal(line.refunded.tax, line.payable.tax);
    assert.equal(line.refunded.total, line.payable.total);
  }
  assert.equal(finalView.refunded.subtotal, finalView.payable.subtotal);
  assert.equal(finalView.refunded.discount, finalView.payable.discount);
  assert.equal(finalView.refunded.tax, finalView.payable.tax);
  assert.equal(finalView.refunded.total, finalView.payable.total);
  checkCumulative(finalView, spec);
}

test('randomized orders with random refund sequences', () => {
  const seed = Number(process.env.TEST_SEED ?? 20260928);
  const rand = mulberry32(seed);
  const variantCounts = new Map<number, number>();
  for (let iter = 0; iter < 120; iter++) {
    _resetStoreForTests();
    const variant = iter % 7; // 覆盖 0~5 特例如意 + 6 通用
    const spec = generateOrder(rand, variant);
    variantCounts.set(variant, (variantCounts.get(variant) ?? 0) + 1);
    runRandomRefundSequence(rand, spec);
  }
  // 每种特例如意都至少跑过若干次
  for (let v = 0; v <= 6; v++) assert.ok((variantCounts.get(v) ?? 0) >= 10, `variant ${v} covered`);
});
