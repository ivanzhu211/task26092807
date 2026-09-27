/** 内存订单存储（内部实现细节，不对外暴露） */

export interface StoredLine {
  lineId: string;
  unitPrice: bigint;
  quantity: bigint;
  subtotal: bigint;
  /** 分摊到的折扣（分） */
  discount: bigint;
  /** 分摊到的税（分） */
  tax: bigint;
  /** 累计已退件数 */
  refundedQuantity: bigint;
  /** 累计已退金额（分） */
  refundedGoods: bigint;
  refundedDiscount: bigint;
  refundedTax: bigint;
}

export interface StoredOrder {
  orderId: string;
  lines: StoredLine[];
  lineIndex: Map<string, number>;
  subtotal: bigint;
  discountTotal: bigint;
  taxTotal: bigint;
  total: bigint;
  refundCount: number;
}

const orders = new Map<string, StoredOrder>();
let orderSeq = 0;

export function nextOrderId(): string {
  orderSeq += 1;
  return `ord_${orderSeq}`;
}

export function saveOrder(order: StoredOrder): void {
  orders.set(order.orderId, order);
}

export function findOrder(orderId: string): StoredOrder | undefined {
  return orders.get(orderId);
}

export function _resetStoreForTests(): void {
  orders.clear();
  orderSeq = 0;
}
