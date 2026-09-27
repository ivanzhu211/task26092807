import { OrderView, RefundItemInput, RefundResult } from './types';
export declare function refundUnits(orderId: string, items: RefundItemInput[]): RefundResult;
export declare function refundRemaining(orderId: string): RefundResult;
export declare function getOrder(orderId: string): OrderView;
