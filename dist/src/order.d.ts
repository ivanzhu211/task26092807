import { Discount, OrderLineInput } from './types';
export declare function createOrder(lines: OrderLineInput[], taxRate: string, discount?: Discount): string;
