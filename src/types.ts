export interface OrderLineInput {
  lineId: string;
  unitPrice: bigint;
  quantity: bigint;
}

export type Discount =
  | { type: "percent"; percent: string }
  | { type: "fixed"; amount: bigint };

export interface RefundItemInput {
  lineId: string;
  quantity: bigint;
}

export interface MoneyBreakdown {
  goods: bigint;
  discount: bigint;
  tax: bigint;
  total: bigint;
}

export interface RefundLineResult extends MoneyBreakdown {
  lineId: string;
  quantity: bigint;
}

export interface RefundResult {
  orderId: string;
  lines: RefundLineResult[];
  total: MoneyBreakdown;
}

export type OrderStatus = "none" | "partial" | "full";

export interface OrderLineView {
  lineId: string;
  unitPrice: bigint;
  quantity: bigint;
  refundedQuantity: bigint;
  payable: MoneyBreakdown;
  refunded: MoneyBreakdown;
}

export interface OrderView {
  orderId: string;
  status: OrderStatus;
  lines: OrderLineView[];
  payable: MoneyBreakdown;
  refunded: MoneyBreakdown;
}
