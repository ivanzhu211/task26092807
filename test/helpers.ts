import assert from "node:assert/strict";
import {
  createOrder,
  getOrder,
  refundRemaining,
  refundUnits,
} from "../src/orders.ts";
import type {
  Discount,
  OrderLineInput,
  OrderView,
  RefundItemInput,
} from "../src/types.ts";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function randBigInt(rng: () => number, lo: bigint, hi: bigint): bigint {
  const span = hi - lo + 1n;
  const bits = span.toString(2).length;
  let v = 0n;
  for (let i = 0; i < bits; i += 26) {
    v = (v << 26n) | BigInt(Math.floor(rng() * 2 ** 26));
  }
  return lo + (v % span);
}

export function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface GeneratedOrder {
  lines: OrderLineInput[];
  taxRate: string;
  discount?: Discount;
}

export function randomDecimalString(
  rng: () => number,
  maxInt: number,
  maxDecimals: number,
): string {
  const intPart = randInt(rng, 0, maxInt);
  const decs = intPart >= maxInt ? 0 : randInt(rng, 0, maxDecimals);
  if (decs === 0) return String(intPart);
  let frac = "";
  for (let i = 0; i < decs; i++) frac += String(randInt(rng, 0, 9));
  return `${intPart}.${frac}`;
}

export function generateOrder(rng: () => number): GeneratedOrder {
  const numLines = randInt(rng, 1, 8);
  const lines: OrderLineInput[] = [];
  for (let i = 0; i < numLines; i++) {
    const priceRoll = rng();
    const unitPrice =
      priceRoll < 0.15
        ? 0n
        : priceRoll < 0.3
          ? randBigInt(rng, 1n, 1_000_000_000n)
          : randBigInt(rng, 1n, 5_000n);
    const qtyRoll = rng();
    const quantity =
      qtyRoll < 0.15
        ? randBigInt(rng, 999_999_000n, 1_000_000_000n)
        : randBigInt(rng, 1n, 20n);
    lines.push({ lineId: `L${i}-${randInt(rng, 0, 999)}`, unitPrice, quantity });
  }
  const taxRate = randomDecimalString(rng, rng() < 0.7 ? 30 : 100, 4);
  let subtotal = 0n;
  for (const l of lines) subtotal += l.unitPrice * l.quantity;
  const roll = rng();
  let discount: Discount | undefined;
  if (roll < 0.3) {
    discount = undefined;
  } else if (roll < 0.6) {
    discount = { type: "percent", percent: randomDecimalString(rng, 100, 2) };
  } else if (roll < 0.8) {
    discount = {
      type: "fixed",
      amount: randBigInt(rng, 0n, subtotal > 0n ? subtotal : 10n),
    };
  } else {
    discount = { type: "fixed", amount: subtotal };
  }
  return { lines, taxRate, discount };
}

function checkLineInvariants(view: OrderView): void {
  let sumGoods = 0n;
  let sumDisc = 0n;
  let sumTax = 0n;
  let rGoods = 0n;
  let rDisc = 0n;
  let rTax = 0n;
  let anyRefunded = false;
  let allRefunded = view.lines.length > 0;
  for (const l of view.lines) {
    sumGoods += l.payable.goods;
    sumDisc += l.payable.discount;
    sumTax += l.payable.tax;
    rGoods += l.refunded.goods;
    rDisc += l.refunded.discount;
    rTax += l.refunded.tax;
    if (l.refundedQuantity > 0n) anyRefunded = true;
    if (l.refundedQuantity < l.quantity) allRefunded = false;
    assert.equal(
      l.refunded.goods,
      l.unitPrice * l.refundedQuantity,
      `goods must equal unitPrice*refundedQty for ${l.lineId}`,
    );
    for (const [name, share, refunded] of [
      ["discount", l.payable.discount, l.refunded.discount],
      ["tax", l.payable.tax, l.refunded.tax],
    ] as const) {
      const diff =
        refunded * l.quantity - share * l.refundedQuantity;
      const abs = diff < 0n ? -diff : diff;
      assert.ok(
        abs < l.quantity,
        `${name} cumulative refund within 1 cent of exact share for ${l.lineId}`,
      );
      assert.ok(refunded >= 0n, `${name} refunded non-negative`);
      assert.ok(refunded <= share, `${name} refunded <= payable`);
    }
    assert.ok(l.refunded.goods <= l.payable.goods, "goods refunded <= payable");
    assert.ok(l.refunded.total <= l.payable.total, "total refunded <= payable");
    assert.ok(l.refundedQuantity <= l.quantity, "refundedQty <= quantity");
  }
  assert.equal(view.payable.goods, sumGoods, "order goods = sum of lines");
  assert.equal(view.payable.discount, sumDisc, "order discount = sum of lines");
  assert.equal(view.payable.tax, sumTax, "order tax = sum of lines");
  assert.equal(view.refunded.goods, rGoods);
  assert.equal(view.refunded.discount, rDisc);
  assert.equal(view.refunded.tax, rTax);
  const expectedStatus = !anyRefunded ? "none" : allRefunded ? "full" : "partial";
  assert.equal(view.status, expectedStatus, "status matches refund progress");
}

export function checkAllocationInvariants(
  view: OrderView,
  discount: Discount | undefined,
): void {
  const S = view.payable.goods;
  const D = view.payable.discount;
  const T = view.payable.tax;
  const SD = S - D;
  for (const l of view.lines) {
    if (S > 0n) {
      const exactNum = D * l.payable.goods;
      const floor = exactNum / S;
      assert.ok(
        l.payable.discount === floor || l.payable.discount === floor + 1n,
        `line discount is floor or ceil of exact share for ${l.lineId}`,
      );
    } else {
      assert.equal(l.payable.discount, 0n);
    }
    const taxable = l.payable.goods - l.payable.discount;
    if (SD > 0n) {
      const exactNum = T * taxable;
      const floor = exactNum / SD;
      assert.ok(
        l.payable.tax === floor || l.payable.tax === floor + 1n,
        `line tax is floor or ceil of exact share for ${l.lineId}`,
      );
    } else {
      assert.equal(l.payable.tax, 0n);
    }
  }
}

export interface TrackedOrder {
  input: GeneratedOrder;
  orderId: string;
  refundedSoFar: Map<string, bigint>;
}

export function trackCreate(input: GeneratedOrder): TrackedOrder {
  const orderId = createOrder(input.lines, input.taxRate, input.discount);
  const view = getOrder(orderId);
  checkLineInvariants(view);
  checkAllocationInvariants(view, input.discount);
  return { input, orderId, refundedSoFar: new Map() };
}

export function checkPathIndependence(tracked: TrackedOrder): void {
  const freshId = createOrder(
    tracked.input.lines,
    tracked.input.taxRate,
    tracked.input.discount,
  );
  const items: RefundItemInput[] = [];
  for (const [lineId, qty] of tracked.refundedSoFar) {
    if (qty > 0n) items.push({ lineId, quantity: qty });
  }
  if (items.length > 0) refundUnits(freshId, items);
  const a = getOrder(tracked.orderId);
  const b = getOrder(freshId);
  const bByLine = new Map(b.lines.map((l) => [l.lineId, l]));
  for (const la of a.lines) {
    const lb = bByLine.get(la.lineId)!;
    assert.deepEqual(
      la.refunded,
      lb.refunded,
      `path independence for line ${la.lineId}`,
    );
  }
  assert.deepEqual(a.refunded, b.refunded, "path independence for order totals");
}

export function trackRefund(
  tracked: TrackedOrder,
  items: RefundItemInput[],
): void {
  const result = refundUnits(tracked.orderId, items);
  for (const l of result.lines) {
    assert.ok(l.quantity > 0n, "refund line quantity positive");
    assert.ok(l.goods >= 0n && l.discount >= 0n && l.tax >= 0n, "components non-negative");
    assert.ok(l.total >= 0n, "line total non-negative");
    assert.equal(l.total, l.goods - l.discount + l.tax);
    tracked.refundedSoFar.set(
      l.lineId,
      (tracked.refundedSoFar.get(l.lineId) ?? 0n) + l.quantity,
    );
  }
  assert.equal(
    result.total.total,
    result.total.goods - result.total.discount + result.total.tax,
  );
  let sg = 0n, sd = 0n, st = 0n;
  for (const l of result.lines) {
    sg += l.goods; sd += l.discount; st += l.tax;
  }
  assert.equal(result.total.goods, sg);
  assert.equal(result.total.discount, sd);
  assert.equal(result.total.tax, st);
  const view = getOrder(tracked.orderId);
  checkLineInvariants(view);
  for (const l of view.lines) {
    assert.equal(
      l.refundedQuantity,
      tracked.refundedSoFar.get(l.lineId) ?? 0n,
      `tracked refunded qty matches for ${l.lineId}`,
    );
  }
  checkPathIndependence(tracked);
}

export function trackRefundRemaining(tracked: TrackedOrder): void {
  refundRemaining(tracked.orderId);
  const view = getOrder(tracked.orderId);
  for (const l of view.lines) {
    tracked.refundedSoFar.set(l.lineId, l.quantity);
    assert.deepEqual(l.refunded, l.payable, `full refund equals payable for ${l.lineId}`);
  }
  assert.deepEqual(view.refunded, view.payable, "order fully refunded");
  assert.equal(view.status, "full");
  checkLineInvariants(view);
  checkPathIndependence(tracked);
}
