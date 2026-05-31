/**
 * Unit tests for RfmDrawer column auto-detection patterns.
 * Tests autoDetectPriority against common Chinese and English column name variants.
 */

import { describe, it, expect } from 'bun:test';

// ── Inline the patterns and helper under test ──────────────────────────────
// (Mirror of RfmDrawer.tsx; kept in sync manually)

function autoDetectPriority(columns: string[], patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = columns.find((c) => pattern.test(c));
    if (match) return match;
  }
  return '';
}

const USER_ID_PATTERNS: RegExp[] = [
  /^(用户ID|用户id|用户编号|用户号|顾客ID|顾客编号|客户ID|客户编号|会员ID|会员编号|会员号|买家ID|买家编号|账号|账户|用户账号)$/,
  /^(uid|user_id|userid|user_no|user_code|user_num)$/i,
  /^(customer_id|customerid|cust_id|custid|cust_no|cust_code)$/i,
  /^(member_id|memberid|buyer_id|buyerid|client_id|clientid)$/i,
  /(用户|顾客|客户|会员|买家|账户|账号).*(id|编号|号)/i,
  /(user|customer|member|buyer|client)[_\s]*(id|no|code|num)/i,
  /用户|顾客|客户|会员|买家/,
  /(^|_)(user|customer|member|buyer|client)($|_)/i,
];

const ORDER_TIME_PATTERNS: RegExp[] = [
  /^(下单时间|下单日期|购买时间|购买日期|订单时间|订单日期|交易时间|交易日期|成交时间|成交日期|消费时间|建单时间|下单_时间)$/,
  /^(order_date|orderdate|order_time|ordertime|order_at|order_created_at)$/i,
  /^(created_at|create_time|createtime|create_date|createdate)$/i,
  /^(purchase_time|purchasetime|purchase_date|purchasedate|purchase_at)$/i,
  /^(transaction_time|transaction_date|trade_time|trade_date|pay_time|pay_date|payment_time)$/i,
  /(下单|购买|成交|交易|订单|支付|付款).*(时间|日期)/,
  /(order|purchase|transaction|trade|pay)[_\s]*(date|time|at|datetime)/i,
  /^(时间|日期|下单|create_?time|created_?at)$/i,
  /(^|_)(date|time|created|at)($|_)/i,
];

const AMOUNT_PATTERNS: RegExp[] = [
  /^(订单金额|总金额|实付金额|应付金额|成交金额|支付金额|消费金额|金额|销售额|收入|总价|实付|实付款)$/,
  /^(order_amount|orderamount|total_amount|totalamount|paid_amount|payment_amount|gmv)$/i,
  /^(amount|price|revenue|sales|total|cost|fee)$/i,
  /金额|价格|实付|总额|收入|销售|支付.*金/,
  /(^|_)(amount|price|total|revenue|sales|payment|gmv)($|_)/i,
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RfmDrawer — USER_ID auto-detection', () => {
  const detect = (cols: string[]) => autoDetectPriority(cols, USER_ID_PATTERNS);

  it('detects exact Chinese: 用户ID', () => expect(detect(['用户ID', 'order_date', 'amount'])).toBe('用户ID'));
  it('detects exact Chinese: 会员编号', () => expect(detect(['会员编号', 'time', 'price'])).toBe('会员编号'));
  it('detects exact Chinese: 账号', () => expect(detect(['账号', 'create_time', '金额'])).toBe('账号'));
  it('detects uid (shorthand)', () => expect(detect(['uid', 'created_at', 'amount'])).toBe('uid'));
  it('detects user_id (snake_case)', () => expect(detect(['user_id', 'order_date', 'total'])).toBe('user_id'));
  it('detects userid (no underscore)', () => expect(detect(['userid', 'orderdate', 'amount'])).toBe('userid'));
  it('detects customer_id', () => expect(detect(['customer_id', 'order_time', 'price'])).toBe('customer_id'));
  it('detects member_id', () => expect(detect(['member_id', 'purchase_date', 'total_amount'])).toBe('member_id'));
  it('detects buyer_id', () => expect(detect(['buyer_id', 'order_date', 'amount'])).toBe('buyer_id'));
  it('detects cust_id', () => expect(detect(['cust_id', 'order_date', 'amount'])).toBe('cust_id'));
  it('detects 用户编号 (contains)', () => expect(detect(['订单编号', '用户编号', 'create_time', '金额'])).toBe('用户编号'));
  it('returns empty when no match', () => expect(detect(['product_name', 'qty', 'create_time'])).toBe(''));
  it('prefers user_id over generic user column', () => {
    expect(detect(['user_name', 'user_id', 'created_at', 'amount'])).toBe('user_id');
  });
});

describe('RfmDrawer — ORDER_TIME auto-detection', () => {
  const detect = (cols: string[]) => autoDetectPriority(cols, ORDER_TIME_PATTERNS);

  it('detects exact Chinese: 下单时间', () => expect(detect(['user_id', '下单时间', 'amount'])).toBe('下单时间'));
  it('detects exact Chinese: 订单日期', () => expect(detect(['用户ID', '订单日期', '金额'])).toBe('订单日期'));
  it('detects exact Chinese: 交易时间', () => expect(detect(['用户号', '交易时间', '实付金额'])).toBe('交易时间'));
  it('detects order_date', () => expect(detect(['user_id', 'order_date', 'amount'])).toBe('order_date'));
  it('detects order_time', () => expect(detect(['uid', 'order_time', 'total'])).toBe('order_time'));
  it('detects created_at', () => expect(detect(['user_id', 'created_at', 'amount'])).toBe('created_at'));
  it('detects create_time (no d suffix)', () => expect(detect(['user_id', 'create_time', 'amount'])).toBe('create_time'));
  it('detects createtime (no underscore)', () => expect(detect(['userid', 'createtime', 'amount'])).toBe('createtime'));
  it('detects purchase_time', () => expect(detect(['customer_id', 'purchase_time', 'price'])).toBe('purchase_time'));
  it('detects transaction_date', () => expect(detect(['uid', 'transaction_date', 'total'])).toBe('transaction_date'));
  it('detects pay_time', () => expect(detect(['user_id', 'pay_time', 'amount'])).toBe('pay_time'));
  it('detects 订单创建时间 (contains pattern)', () => expect(detect(['user_id', '订单创建时间', '金额'])).toBe('订单创建时间'));
  it('returns empty when no match', () => expect(detect(['product_id', 'qty', 'sku'])).toBe(''));
  it('prefers order_date over generic time column', () => {
    expect(detect(['update_time', 'order_date', 'user_id'])).toBe('order_date');
  });
});

describe('RfmDrawer — AMOUNT auto-detection', () => {
  const detect = (cols: string[]) => autoDetectPriority(cols, AMOUNT_PATTERNS);

  it('detects exact Chinese: 订单金额', () => expect(detect(['user_id', 'order_date', '订单金额'])).toBe('订单金额'));
  it('detects exact Chinese: 实付金额', () => expect(detect(['用户ID', '下单时间', '实付金额'])).toBe('实付金额'));
  it('detects total_amount', () => expect(detect(['user_id', 'order_date', 'total_amount'])).toBe('total_amount'));
  it('detects amount', () => expect(detect(['user_id', 'created_at', 'amount'])).toBe('amount'));
  it('detects gmv', () => expect(detect(['uid', 'order_time', 'gmv'])).toBe('gmv'));
  it('returns empty when no match', () => expect(detect(['product_id', 'qty', 'sku'])).toBe(''));
});

describe('RfmDrawer — full column set auto-detection (realistic scenario)', () => {
  it('Chinese column dataset', () => {
    const cols = ['订单编号', '用户ID', '下单时间', '实付金额', '商品名称', '数量'];
    expect(autoDetectPriority(cols, USER_ID_PATTERNS)).toBe('用户ID');
    expect(autoDetectPriority(cols, ORDER_TIME_PATTERNS)).toBe('下单时间');
    expect(autoDetectPriority(cols, AMOUNT_PATTERNS)).toBe('实付金额');
  });

  it('English column dataset', () => {
    const cols = ['order_id', 'user_id', 'created_at', 'total_amount', 'product_name', 'qty'];
    expect(autoDetectPriority(cols, USER_ID_PATTERNS)).toBe('user_id');
    expect(autoDetectPriority(cols, ORDER_TIME_PATTERNS)).toBe('created_at');
    expect(autoDetectPriority(cols, AMOUNT_PATTERNS)).toBe('total_amount');
  });

  it('Mixed Chinese/English uid + create_time', () => {
    const cols = ['uid', 'create_time', 'amount', 'sku', 'qty'];
    expect(autoDetectPriority(cols, USER_ID_PATTERNS)).toBe('uid');
    expect(autoDetectPriority(cols, ORDER_TIME_PATTERNS)).toBe('create_time');
    expect(autoDetectPriority(cols, AMOUNT_PATTERNS)).toBe('amount');
  });

  it('Shorthand no-underscore: userid / orderdate / totalamount', () => {
    const cols = ['userid', 'orderdate', 'totalamount'];
    expect(autoDetectPriority(cols, USER_ID_PATTERNS)).toBe('userid');
    expect(autoDetectPriority(cols, ORDER_TIME_PATTERNS)).toBe('orderdate');
    expect(autoDetectPriority(cols, AMOUNT_PATTERNS)).toBe('totalamount');
  });
});
