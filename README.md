# order-refund

纯内存的订单金额计算与部分退款库（TypeScript，无 HTTP、无持久化）。
金额与数量一律使用 `bigint`，全程无浮点运算。

## API

- `createOrder(lines, taxRate, discount?) => orderId`
  - `lines`: `{ lineId, unitPrice, quantity }[]`，`lineId` 单订单内唯一
  - `taxRate`: 百分比十进制字符串，最多 4 位小数，范围 0–100（如 `"8.875"`）
  - `discount`: `{ type: "percent", percent: string }`（最多 2 位小数）或 `{ type: "fixed", amount: bigint }`（分）
- `refundUnits(orderId, items) => RefundResult`：按行退若干件，同一请求内重复 `lineId` 先合并；任一行非法则整单拒绝
- `refundRemaining(orderId) => RefundResult`：退掉全部未退件
- `getOrder(orderId) => OrderView`：每行及整单的应付、累计已退与状态（`none` / `partial` / `full`）
- `resetOrders()`：清空内存中的订单（测试用）

## 金额规则

- 小计 `S = Σ 单价×数量`
- 折扣 `D`：百分比型为 `S×百分比` 四舍五入（半分进位）；固定金额型为 `min(面额, S)`
- 税 `T = (S−D)×税率` 四舍五入，整单只算一次
- 实付 `= S−D+T`；`D`、`T` 按最大余数法分摊到行（余数并列时按 `lineId` 字典序，与行输入顺序无关）
- 每行累计退款按「行份额 × 已退件数 ÷ 行件数」四舍五入，路径无关；全退时逐分等于应付

## 开发

```sh
npm run typecheck   # tsc --noEmit
npm test            # node --test（Node ≥ 22，直接运行 TS）
```
