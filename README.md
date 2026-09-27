# order-refund

订单金额计算与部分退款的纯内存 TypeScript 库。无 HTTP 层、无持久化，测试直接调用函数。

## 接口

```ts
import { createOrder, refundUnits, refundRemaining, getOrder } from './src';

const orderId = createOrder(
  [{ lineId: 'a', unitPrice: 1000n, quantity: 2n }], // 金额、数量一律 bigint（分）
  '8.875',                                           // 税率百分比字符串，最多 4 位小数
  { type: 'percent', percent: '12.5' },              // 或 { type: 'fixed', amount: 500n }
);

refundUnits(orderId, [{ lineId: 'a', quantity: 1n }]); // 本次每行 商品额/折扣额/税额/合计
refundRemaining(orderId);                              // 退掉全部未退件数
getOrder(orderId);                                     // 每行及整单 应付/累计已退 + 状态 none|partial|full
```

## 规则要点

- 小计 S、折扣 D（百分比型四舍五入、固定金额型 min(面额, S)）、税 T = round((S−D)×税率) 整单只算一次，全部四舍五入到分、半分进位。
- D、T 用最大余数法分摊到行，余数相等按 lineId 字典序，结果与行的传入顺序无关。
- 累计退款曲线为 round(行份额 × 已退件数 ÷ 行件数)：只取决于累计件数（路径无关），与精确值之差 ≤ 0.5 分，退完时逐分等于实付。
- 全程 bigint 运算，不经过浮点；退款开销只与本次请求行数有关。
- 同一请求内重复 lineId 先合并；任一项非法整个请求拒绝，不留部分效果。

## 构建与测试

```sh
npm run build   # tsc（需要本机有 tsc）
npm test        # 构建并运行全部测试
TEST_SEED=42 npm test   # 换随机种子
```
