import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  createOrder,
  getOrder,
  refundRemaining,
  refundUnits,
  resetOrders,
} from "../src/orders.ts";

beforeEach(() => resetOrders());

test("basic order math: subtotal, percent discount, tax rounding", () => {
  const id = createOrder(
    [
      { lineId: "a", unitPrice: 333n, quantity: 3n },
      { lineId: "b", unitPrice: 100n, quantity: 1n },
    ],
    "8.875",
    { type: "percent", percent: "10" },
  );
  const v = getOrder(id);
  assert.equal(v.payable.goods, 1099n);
  assert.equal(v.payable.discount, 110n);
  assert.equal(v.payable.tax, 88n);
  assert.equal(v.payable.total, 1077n);
  assert.equal(v.status, "none");
});

test("tax is computed once on the order, not per line", () => {
  const id = createOrder(
    [
      { lineId: "a", unitPrice: 1n, quantity: 1n },
      { lineId: "b", unitPrice: 1n, quantity: 1n },
      { lineId: "c", unitPrice: 1n, quantity: 1n },
    ],
    "10",
  );
  const v = getOrder(id);
  assert.equal(v.payable.tax, 0n);
});

test("tax exact half cent rounds up", () => {
  const id = createOrder([{ lineId: "a", unitPrice: 1n, quantity: 1n }], "50");
  const v = getOrder(id);
  assert.equal(v.payable.tax, 1n);
  assert.equal(v.payable.total, 2n);
});

test("fixed discount capped at subtotal", () => {
  const id = createOrder(
    [{ lineId: "a", unitPrice: 500n, quantity: 2n }],
    "10",
    { type: "fixed", amount: 9999n },
  );
  const v = getOrder(id);
  assert.equal(v.payable.discount, 1000n);
  assert.equal(v.payable.tax, 0n);
  assert.equal(v.payable.total, 0n);
});

test("discount equal to subtotal yields zero taxable", () => {
  const id = createOrder(
    [
      { lineId: "a", unitPrice: 700n, quantity: 1n },
      { lineId: "b", unitPrice: 300n, quantity: 1n },
    ],
    "8.875",
    { type: "fixed", amount: 1000n },
  );
  const v = getOrder(id);
  assert.equal(v.payable.discount, 1000n);
  assert.equal(v.payable.tax, 0n);
  const discSum = v.lines.reduce((s, l) => s + l.payable.discount, 0n);
  assert.equal(discSum, 1000n);
});

test("zero-price lines and zero subtotal: no division by zero", () => {
  const id = createOrder(
    [
      { lineId: "a", unitPrice: 0n, quantity: 5n },
      { lineId: "b", unitPrice: 0n, quantity: 3n },
    ],
    "8.875",
    { type: "percent", percent: "50" },
  );
  const v = getOrder(id);
  assert.equal(v.payable.total, 0n);
  refundRemaining(id);
  const after = getOrder(id);
  assert.equal(after.status, "full");
  assert.equal(after.refunded.total, 0n);
});

test("invalid tax rates are rejected", () => {
  const lines = [{ lineId: "a", unitPrice: 1n, quantity: 1n }];
  for (const bad of ["", "-1", "1e2", "1.00001", "100.0001", "101", "abc", "1.", ".5", " 1", "1 "]) {
    assert.throws(() => createOrder(lines, bad), `rejects "${bad}"`);
  }
  for (const ok of ["0", "100", "8.875", "0.0001", "99.9999"]) {
    assert.doesNotThrow(() => createOrder(lines, ok), `accepts "${ok}"`);
  }
});

test("invalid percent discounts are rejected", () => {
  const lines = [{ lineId: "a", unitPrice: 1n, quantity: 1n }];
  for (const bad of ["", "-1", "1e2", "1.001", "100.01", "101", "abc"]) {
    assert.throws(
      () => createOrder(lines, "10", { type: "percent", percent: bad }),
      `rejects "${bad}"`,
    );
  }
  for (const ok of ["0", "100", "12.34", "0.01"]) {
    assert.doesNotThrow(() =>
      createOrder(lines, "10", { type: "percent", percent: ok }),
    );
  }
});

test("invalid order inputs are rejected", () => {
  assert.throws(() => createOrder([], "10"));
  assert.throws(() =>
    createOrder(
      [
        { lineId: "a", unitPrice: 1n, quantity: 1n },
        { lineId: "a", unitPrice: 2n, quantity: 1n },
      ],
      "10",
    ),
  );
  assert.throws(() =>
    createOrder([{ lineId: "a", unitPrice: 1n, quantity: 0n }], "10"),
  );
  assert.throws(() =>
    createOrder([{ lineId: "a", unitPrice: -1n, quantity: 1n }], "10"),
  );
  assert.throws(() =>
    createOrder([{ lineId: "", unitPrice: 1n, quantity: 1n }], "10"),
  );
});

test("refund validation is atomic: one bad item rejects the whole request", () => {
  const id = createOrder(
    [
      { lineId: "a", unitPrice: 100n, quantity: 2n },
      { lineId: "b", unitPrice: 50n, quantity: 2n },
    ],
    "10",
  );
  assert.throws(() =>
    refundUnits(id, [
      { lineId: "a", quantity: 1n },
      { lineId: "nope", quantity: 1n },
    ]),
  );
  assert.throws(() =>
    refundUnits(id, [
      { lineId: "a", quantity: 1n },
      { lineId: "b", quantity: 3n },
    ]),
  );
  assert.throws(() =>
    refundUnits(id, [
      { lineId: "a", quantity: 1n },
      { lineId: "b", quantity: 0n },
    ]),
  );
  const v = getOrder(id);
  assert.equal(v.status, "none");
  assert.equal(v.refunded.total, 0n);
});

test("duplicate lineIds in one request are merged before validation", () => {
  const id = createOrder([{ lineId: "a", unitPrice: 100n, quantity: 3n }], "10");
  const r = refundUnits(id, [
    { lineId: "a", quantity: 1n },
    { lineId: "a", quantity: 2n },
  ]);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].quantity, 3n);
  assert.throws(() =>
    refundUnits(id, [
      { lineId: "a", quantity: 2n },
      { lineId: "a", quantity: 2n },
    ]),
  );
});

test("unknown order and unknown line are rejected", () => {
  assert.throws(() => getOrder("ord-999"));
  assert.throws(() => refundUnits("ord-999", [{ lineId: "a", quantity: 1n }]));
  const id = createOrder([{ lineId: "a", unitPrice: 1n, quantity: 1n }], "10");
  assert.throws(() => refundUnits(id, [{ lineId: "b", quantity: 1n }]));
});

test("full refund equals payable exactly, per line and per order", () => {
  const id = createOrder(
    [
      { lineId: "a", unitPrice: 999n, quantity: 7n },
      { lineId: "b", unitPrice: 1n, quantity: 3n },
      { lineId: "c", unitPrice: 12345n, quantity: 2n },
    ],
    "8.875",
    { type: "percent", percent: "33.33" },
  );
  refundUnits(id, [{ lineId: "a", quantity: 2n }]);
  refundRemaining(id);
  const v = getOrder(id);
  assert.equal(v.status, "full");
  for (const l of v.lines) assert.deepEqual(l.refunded, l.payable);
  assert.deepEqual(v.refunded, v.payable);
});

test("refundRemaining on fully refunded order is a no-op", () => {
  const id = createOrder([{ lineId: "a", unitPrice: 1n, quantity: 1n }], "10");
  refundRemaining(id);
  const r = refundRemaining(id);
  assert.equal(r.lines.length, 0);
  assert.equal(r.total.total, 0n);
});

test("large values keep full precision", () => {
  const id = createOrder(
    [{ lineId: "a", unitPrice: 1_000_000_000n, quantity: 1_000_000_000n }],
    "8.875",
    { type: "percent", percent: "12.34" },
  );
  const v = getOrder(id);
  assert.equal(v.payable.goods, 1_000_000_000_000_000_000n);
  assert.equal(v.payable.discount, 123_400_000_000_000_000n);
  assert.equal(v.payable.tax, 77_798_250_000_000_000n);
  refundUnits(id, [{ lineId: "a", quantity: 999_999_999n }]);
  refundRemaining(id);
  const after = getOrder(id);
  assert.deepEqual(after.refunded, after.payable);
});
