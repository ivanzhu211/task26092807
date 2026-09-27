/** 订单行输入 */
export interface OrderLineInput {
  lineId: string;
  /** 单价（分） */
  unitPrice: bigint;
  /** 数量 */
  quantity: bigint;
}

/** 折扣码 */
export type Discount =
  | { type: 'percent'; /** 十进制字符串，最多2位小数，0~100 */ percent: string }
  | { type: 'fixed'; /** 固定金额（分） */ amount: bigint };

/** 退款请求项 */
export interface RefundItemInput {
  lineId: string;
  quantity: bigint;
}

/** 一条退款明细（某行本次退的金额，单位分） */
export interface RefundLineResult {
  lineId: string;
  quantity: bigint;
  goods: bigint;
  discount: bigint;
  tax: bigint;
  total: bigint;
}

/** 一次退款的结果 */
export interface RefundResult {
  refundId: string;
  orderId: string;
  lines: RefundLineResult[];
  goods: bigint;
  discount: bigint;
  tax: bigint;
  total: bigint;
}

export type OrderStatus = 'none' | 'partial' | 'full';

/** 行的金额视图（应付 / 累计已退） */
export interface LineAmounts {
  subtotal: bigint;
  discount: bigint;
  tax: bigint;
  total: bigint;
}

export interface OrderLineView {
  lineId: string;
  unitPrice: bigint;
  quantity: bigint;
  payable: LineAmounts;
  refunded: LineAmounts & { quantity: bigint };
  remainingQuantity: bigint;
}

export interface OrderView {
  orderId: string;
  status: OrderStatus;
  lines: OrderLineView[];
  payable: LineAmounts;
  refunded: LineAmounts;
}
