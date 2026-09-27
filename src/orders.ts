import { allocate } from "./allocate.ts";
import { parsePercentRate, parseTaxRate, roundHalfUp } from "./decimal.ts";
import type {
  Discount,
  MoneyBreakdown,
  OrderLineInput,
  OrderStatus,
  OrderView,
  RefundItemInput,
  RefundLineResult,
  RefundResult,
} from "./types.ts";

interface LineState {
  lineId: string;
  unitPrice: bigint;
  quantity: bigint;
  refundedQty: bigint;
  goods: bigint;
  discount: bigint;
  tax: bigint;
}

interface OrderState {
  id: string;
  lines: Map<string, LineState>;
  subtotal: bigint;
  discountTotal: bigint;
  taxTotal: bigint;
}

const orders = new Map<string, OrderState>();
let nextId = 1;

export function resetOrders(): void {
  orders.clear();
  nextId = 1;
}

function breakdown(goods: bigint, discount: bigint, tax: bigint): MoneyBreakdown {
  return { goods, discount, tax, total: goods - discount + tax };
}

export function createOrder(
  lines: OrderLineInput[],
  taxRate: string,
  discount?: Discount,
): string {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("order must have at least one line");
  }
  if (lines.length > 100_000) {
    throw new Error("too many lines");
  }
  const seen = new Set<string>();
  for (const l of lines) {
    if (typeof l.lineId !== "string" || l.lineId.length === 0) {
      throw new Error("lineId must be a non-empty string");
    }
    if (seen.has(l.lineId)) throw new Error(`duplicate lineId: ${l.lineId}`);
    seen.add(l.lineId);
    if (typeof l.unitPrice !== "bigint" || l.unitPrice < 0n) {
      throw new Error("unitPrice must be a non-negative bigint");
    }
    if (typeof l.quantity !== "bigint" || l.quantity <= 0n) {
      throw new Error("quantity must be a positive bigint");
    }
  }
  const rate = parseTaxRate(taxRate);

  let subtotal = 0n;
  const goodsByLine = new Map<string, bigint>();
  for (const l of lines) {
    const g = l.unitPrice * l.quantity;
    goodsByLine.set(l.lineId, g);
    subtotal += g;
  }

  let discountTotal = 0n;
  if (discount !== undefined) {
    if (discount.type === "percent") {
      const p = parsePercentRate(discount.percent);
      discountTotal = roundHalfUp(subtotal * p.num, p.den * 100n);
    } else if (discount.type === "fixed") {
      if (typeof discount.amount !== "bigint" || discount.amount < 0n) {
        throw new Error("fixed discount amount must be a non-negative bigint");
      }
      discountTotal = discount.amount < subtotal ? discount.amount : subtotal;
    } else {
      throw new Error("unknown discount type");
    }
  }

  const taxableTotal = subtotal - discountTotal;
  const taxTotal = roundHalfUp(taxableTotal * rate.num, rate.den * 100n);

  const discountShares = allocate(
    discountTotal,
    lines.map((l) => ({ key: l.lineId, weight: goodsByLine.get(l.lineId)! })),
  );
  const taxShares = allocate(
    taxTotal,
    lines.map((l) => ({
      key: l.lineId,
      weight: goodsByLine.get(l.lineId)! - discountShares.get(l.lineId)!,
    })),
  );

  const id = `ord-${nextId++}`;
  const state: OrderState = {
    id,
    lines: new Map(),
    subtotal,
    discountTotal,
    taxTotal,
  };
  for (const l of lines) {
    state.lines.set(l.lineId, {
      lineId: l.lineId,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      refundedQty: 0n,
      goods: goodsByLine.get(l.lineId)!,
      discount: discountShares.get(l.lineId)!,
      tax: taxShares.get(l.lineId)!,
    });
  }
  orders.set(id, state);
  return id;
}

function cumulativeDiscount(line: LineState, refunded: bigint): bigint {
  return roundHalfUp(line.discount * refunded, line.quantity);
}

function cumulativeTax(line: LineState, refunded: bigint): bigint {
  return roundHalfUp(line.tax * refunded, line.quantity);
}

function getOrderState(orderId: string): OrderState {
  const o = orders.get(orderId);
  if (!o) throw new Error(`unknown order: ${orderId}`);
  return o;
}

function applyRefund(order: OrderState, items: RefundItemInput[]): RefundResult {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("refund items must be a non-empty array");
  }
  const merged = new Map<string, bigint>();
  for (const it of items) {
    if (typeof it.lineId !== "string" || it.lineId.length === 0) {
      throw new Error("lineId must be a non-empty string");
    }
    if (typeof it.quantity !== "bigint" || it.quantity <= 0n) {
      throw new Error("refund quantity must be a positive bigint");
    }
    merged.set(it.lineId, (merged.get(it.lineId) ?? 0n) + it.quantity);
  }
  for (const [lineId, qty] of merged) {
    const line = order.lines.get(lineId);
    if (!line) throw new Error(`unknown lineId: ${lineId}`);
    if (qty > line.quantity - line.refundedQty) {
      throw new Error(`refund quantity exceeds remaining for line: ${lineId}`);
    }
  }
  const resultLines: RefundLineResult[] = [];
  const sum: MoneyBreakdown = { goods: 0n, discount: 0n, tax: 0n, total: 0n };
  for (const [lineId, qty] of merged) {
    const line = order.lines.get(lineId)!;
    const before = line.refundedQty;
    const after = before + qty;
    const goods = line.unitPrice * qty;
    const disc = cumulativeDiscount(line, after) - cumulativeDiscount(line, before);
    const tax = cumulativeTax(line, after) - cumulativeTax(line, before);
    line.refundedQty = after;
    const bd = breakdown(goods, disc, tax);
    resultLines.push({ lineId, quantity: qty, ...bd });
    sum.goods += bd.goods;
    sum.discount += bd.discount;
    sum.tax += bd.tax;
    sum.total += bd.total;
  }
  return { orderId: order.id, lines: resultLines, total: sum };
}

export function refundUnits(
  orderId: string,
  items: RefundItemInput[],
): RefundResult {
  return applyRefund(getOrderState(orderId), items);
}

export function refundRemaining(orderId: string): RefundResult {
  const order = getOrderState(orderId);
  const items: RefundItemInput[] = [];
  for (const line of order.lines.values()) {
    const remaining = line.quantity - line.refundedQty;
    if (remaining > 0n) items.push({ lineId: line.lineId, quantity: remaining });
  }
  if (items.length === 0) {
    return {
      orderId,
      lines: [],
      total: { goods: 0n, discount: 0n, tax: 0n, total: 0n },
    };
  }
  return applyRefund(order, items);
}

export function getOrder(orderId: string): OrderView {
  const order = getOrderState(orderId);
  const view: OrderView = {
    orderId,
    status: "none",
    lines: [],
    payable: breakdown(order.subtotal, order.discountTotal, order.taxTotal),
    refunded: { goods: 0n, discount: 0n, tax: 0n, total: 0n },
  };
  let anyRefunded = false;
  let allRefunded = true;
  for (const line of order.lines.values()) {
    const r = line.refundedQty;
    if (r > 0n) anyRefunded = true;
    if (r < line.quantity) allRefunded = false;
    const refunded = breakdown(
      line.unitPrice * r,
      cumulativeDiscount(line, r),
      cumulativeTax(line, r),
    );
    view.refunded.goods += refunded.goods;
    view.refunded.discount += refunded.discount;
    view.refunded.tax += refunded.tax;
    view.refunded.total += refunded.total;
    view.lines.push({
      lineId: line.lineId,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      refundedQuantity: r,
      payable: breakdown(line.goods, line.discount, line.tax),
      refunded,
    });
  }
  const status: OrderStatus = !anyRefunded ? "none" : allRefunded ? "full" : "partial";
  view.status = status;
  return view;
}
