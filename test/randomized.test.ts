import assert from "node:assert/strict";
import { test } from "node:test";
import { createOrder, getOrder, resetOrders } from "../src/orders.ts";
import type { RefundItemInput } from "../src/types.ts";
import {
  generateOrder,
  mulberry32,
  randBigInt,
  randInt,
  shuffle,
  trackCreate,
  trackRefund,
  trackRefundRemaining,
} from "./helpers.ts";

test("randomized refund sequences satisfy all invariants across 300 seeds", () => {
  for (let seed = 1; seed <= 300; seed++) {
    resetOrders();
    const rng = mulberry32(seed * 2654435761 + 12345);
    const input = generateOrder(rng);
    const tracked = trackCreate(input);

    const view = getOrder(tracked.orderId);
    const remaining = new Map(
      view.lines.map((l) => [l.lineId, l.quantity]),
    );

    const steps = randInt(rng, 1, 12);
    for (let step = 0; step < steps; step++) {
      const available = [...remaining.entries()].filter(([, q]) => q > 0n);
      if (available.length === 0) break;
      const chosen = shuffle(
        rng,
        available,
      ).slice(0, randInt(rng, 1, Math.min(3, available.length)));
      const items: RefundItemInput[] = [];
      for (const [lineId, left] of chosen) {
        let qty = randBigInt(rng, 1n, left);
        remaining.set(lineId, left - qty);
        if (rng() < 0.25 && qty >= 2n) {
          const part = randBigInt(rng, 1n, qty - 1n);
          items.push({ lineId, quantity: part });
          qty -= part;
        }
        items.push({ lineId, quantity: qty });
      }
      const shuffledItems = shuffle(rng, items);
      trackRefund(tracked, shuffledItems);
    }
    trackRefundRemaining(tracked);
  }
});

test("line input order does not change allocation, including equal remainders", () => {
  resetOrders();
  const lineIds = ["l1", "l2", "l3"];

  const build = (ids: string[]) =>
    createOrder(
      ids.map((id) => ({ lineId: id, unitPrice: 100n, quantity: 1n })),
      "0",
      { type: "fixed", amount: 1n },
    );

  const reference = new Map(
    getOrder(build(lineIds)).lines.map((l) => [l.lineId, l.payable]),
  );

  const perms: string[][] = [
    ["l1", "l2", "l3"],
    ["l1", "l3", "l2"],
    ["l2", "l1", "l3"],
    ["l2", "l3", "l1"],
    ["l3", "l1", "l2"],
    ["l3", "l2", "l1"],
  ];
  for (const p of perms) {
    const v = getOrder(build(p));
    for (const l of v.lines) {
      assert.deepEqual(l.payable, reference.get(l.lineId), `discount order-independence (${p.join(",")})`);
    }
  }
  assert.equal(reference.get("l1")!.discount, 1n, "equal-remainder tie resolved by lineId order");
  assert.equal(reference.get("l2")!.discount, 0n);
  assert.equal(reference.get("l3")!.discount, 0n);
});

test("tax allocation is also order independent with tied remainders", () => {
  resetOrders();
  const lineIds = ["l1", "l2", "l3"];
  const perms: string[][] = [
    ["l1", "l2", "l3"],
    ["l2", "l3", "l1"],
    ["l3", "l1", "l2"],
  ];
  const reference = new Map(
    getOrder(
      createOrder(
        lineIds.map((id) => ({ lineId: id, unitPrice: 100n, quantity: 1n })),
        "0.2",
      ),
    ).lines.map((l) => [l.lineId, l.payable]),
  );
  assert.equal(reference.get("l1")!.tax, 1n);
  for (const p of perms) {
    const v = getOrder(
      createOrder(
        p.map((id) => ({ lineId: id, unitPrice: 100n, quantity: 1n })),
        "0.2",
      ),
    );
    for (const l of v.lines) {
      assert.deepEqual(l.payable, reference.get(l.lineId), `tax order-independence (${p.join(",")})`);
    }
  }
});
