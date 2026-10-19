/**
 * feeAllocateRounding — 决议 10/11 执行级断言（12_Feat_Plan §3.2，不进 CI，人工验收跑一次）
 *
 * 用真实 DuckDB（duckdb-wasm node blocking 构建）跑 EcomPlatformFeeAllocateStrategy
 * .buildOperatorSql 生成的 SQL，对种子数据断言尾差对平 / 聚类 / 费用去重 / 零权重保护。
 *
 * 退出码: 0=全部 PASS | 1=断言 FAIL（修 SQL，不得改 fixture 绕过）| 2=环境不可用（走 Runbook 步 6 CLI 回退）
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { EcomPlatformFeeAllocateStrategy } from '../../src/services/flow/strategies/ecomPlatformFeeAllocateStrategy';
import {
  FlowNodeType,
  type FeeAllocateMode,
  type FlowEdge,
  type FlowNode,
  type PlatformFeeAllocateConfig,
} from '../../src/services/flow/types';

const require = createRequire(import.meta.url);

const USAGE = [
  '用法: bun scripts/verify/feeAllocateRounding.ts [选项]',
  '  --help          打印本用法',
  '  --print-sql     打印三种 mode 的策略 SQL（人工核对 EXCLUDE 6 列 / alloc_mode_label / product_net_profit / 末段 ORDER BY）',
  '  --emit <dir>    写出 seed.sql / case_amount.sql / case_quantity.sql / case_even.sql（CLI 回退复核用）',
  '  --scenario <n>  只跑场景 n（1-4）',
  '  (默认)          主路线 A：内存 DuckDB 真跑 4 场景断言',
].join('\n');

const has = (f: string) => process.argv.includes(f);
const argOf = (f: string) => {
  const i = process.argv.indexOf(f);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

// ── 策略 SQL 生成（与产品代码同源，非手写副本）────────────────────────────

const makeCfg = (mode: FeeAllocateMode): PlatformFeeAllocateConfig => ({
  mode,
  fieldMapping: { orderIdCol: 'order_no', amountCol: 'product_amount', quantityCol: 'quantity' },
  feeSlots: {
    slot1: { operator: '+', column: 'platform_fee' },
    slot2: { operator: '+', column: 'ad_fee' },
    slot3: { operator: '+', column: '' },
    slot4: { operator: '+', column: '' },
  },
  deductSlots: {
    slot1: { operator: '-', column: '' },
    slot2: { operator: '-', column: '' },
  },
});

// SAFETY: minimal fixture nodes carry exactly the data fields buildOperatorSql reads
// (tableName / platformFeeAllocateConfig); reactflow's Node generic can't express this structurally.
const makeNodes = (cfg: PlatformFeeAllocateConfig): FlowNode[] => [
  { id: 't1', type: FlowNodeType.TABLE, position: { x: 0, y: 0 }, data: { tableName: 'fee_seed' } },
  { id: 's1', type: FlowNodeType.SELECT, position: { x: 0, y: 0 }, data: { platformFeeAllocateConfig: cfg } },
] as unknown as FlowNode[];

const noEdges: FlowEdge[] = [];

const strategy = new EcomPlatformFeeAllocateStrategy();
const sqlFor = (mode: FeeAllocateMode): string =>
  strategy.buildOperatorSql(makeNodes(makeCfg(mode)), noEdges);

const MODES: FeeAllocateMode[] = ['amount', 'quantity', 'even'];

if (has('--help')) {
  console.log(USAGE);
  process.exit(0);
}

if (has('--print-sql')) {
  for (const m of MODES) console.log(`-- ===== mode=${m} =====\n${sqlFor(m)}`);
  process.exit(0);
}

// 种子表：A1=1:1:1 尾差 | A2/B2=多单聚类 | A3=跨行费用填充(10+5) | Z=零权重
// 附录 B4：VALUES 字面量会解析成 DECIMAL（wasm toJSON 返回未缩放整数）→ 数值列一律 CAST AS DOUBLE
const SEED_SQL = `CREATE TABLE fee_seed AS
  SELECT order_no,
         CAST(product_amount AS DOUBLE) AS product_amount,
         CAST(quantity AS DOUBLE) AS quantity,
         CAST(platform_fee AS DOUBLE) AS platform_fee,
         CAST(ad_fee AS DOUBLE) AS ad_fee
  FROM (VALUES
  ('A1', 10.0, 5.0, 1.00, NULL),
  ('A1', 10.0, 3.0, NULL, NULL),
  ('A1', 10.0, 2.0, NULL, NULL),
  ('B2', 20.0, 1.0, 3.00, NULL),
  ('B2', 20.0, 1.0, NULL, NULL),
  ('A2', 30.0, 1.0, 2.00, NULL),
  ('A2', 10.0, 1.0, NULL, NULL),
  ('A3', 12.0, 1.0, 10.00, NULL),
  ('A3', 8.0, 1.0, NULL, 5.00),
  ('Z', 0.0, 0.0, 7.00, NULL),
  ('Z', NULL, NULL, NULL, NULL)
) AS v(order_no, product_amount, quantity, platform_fee, ad_fee)`;

if (has('--emit')) {
  const dir = argOf('--emit');
  if (!dir) {
    console.error('error: --emit requires <dir>\n' + USAGE);
    process.exit(1);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'seed.sql'), `${SEED_SQL};\n`);
  for (const m of MODES) fs.writeFileSync(path.join(dir, `case_${m}.sql`), `${sqlFor(m)};\n`);
  console.log(`emitted seed.sql + case_{amount,quantity,even}.sql -> ${dir}`);
  process.exit(0);
}

// ── 主路线 A：真实 DuckDB 执行 ────────────────────────────────────────────

const wasmDir = 'node_modules/@duckdb/duckdb-wasm/dist/';
let duckdb: any;
let db: any;
let conn: any;
try {
  duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking');
  const bundles = {
    eh: {
      mainModule: path.resolve(wasmDir, 'duckdb-eh.wasm'),
      mainWorker: path.resolve(wasmDir, 'duckdb-node-eh.worker.cjs'),
    },
  };
  db = await duckdb.createDuckDB(
    bundles,
    new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING),
    duckdb.DEFAULT_RUNTIME,
  );
  await db.instantiate();
  conn = db.connect();
  conn.query(SEED_SQL);
} catch (e) {
  console.error(`[env] duckdb-wasm 主路线 A 不可用: ${String(e)}`);
  console.error('[env] 请按 Runbook 步 6 走 --emit + ~/.duckdb/cli/latest/duckdb 回退复核');
  process.exit(2);
}

const q = (sql: string): any[] => conn.query(sql).toArray().map((r: any) => r.toJSON());
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const r2 = (v: number): number => Math.round(v * 100) / 100;
const rowsOf = (rows: any[], order: string) => rows.filter((r) => r.order_no === order);
const sumAlloc = (rows: any[], order: string) =>
  r2(rowsOf(rows, order).reduce((a, r) => a + num(r.allocated_fee), 0));
const feeTotal = (rows: any[], order: string) => r2(num(rowsOf(rows, order)[0]?.order_fee_total));

const onlyScenario = argOf('--scenario');
const wantScenario = (n: number) => !onlyScenario || onlyScenario === String(n);

let okCount = 0;
let total = 0;
const line = (label: string, checks: [string, boolean][]): void => {
  total += 1;
  const parts = checks.map(([txt, ok]) => `${txt} ${ok ? 'PASS' : 'FAIL'}`);
  if (checks.every(([, ok]) => ok)) okCount += 1;
  console.log(`${label} -> ${parts.join(' | ')}`);
};

const rows = q(sqlFor('amount'));

// 场景 1：费 1.00 / 三行 1:1:1 → Σ==1.00，尾差恰 1 行且在金额最大行
if (wantScenario(1)) {
  const a1 = rowsOf(rows, 'A1');
  const adj = a1.filter((r) => r.is_rounding_adjust);
  line('[scenario 1] rounding 1.00 / 3 rows 1:1:1     ', [
    ['per-order sum=1.00', sumAlloc(rows, 'A1') === 1.0],
    ['adjustRows=1 on max-amount row', adj.length === 1 && num(adj[0].product_amount) === Math.max(...a1.map((r) => num(r.product_amount)))],
  ]);
}

// 场景 2：两单 4 行 → 逐单对平 + 行聚类 + 单内金额降序（决议 10）
if (wantScenario(2)) {
  const seq = rows.map((r) => r.order_no);
  const clustered = (o: string) => {
    const idx = seq.map((v, i) => (v === o ? i : -1)).filter((i) => i >= 0);
    return idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  };
  const amountDesc = (o: string) => {
    const a = rowsOf(rows, o).map((r) => num(r.product_amount));
    return a.every((v, i) => i === 0 || a[i - 1] >= v);
  };
  line('[scenario 2] two orders / 4 rows (cluster)   ', [
    ['per-order sum', sumAlloc(rows, 'A2') === feeTotal(rows, 'A2') && sumAlloc(rows, 'B2') === feeTotal(rows, 'B2')],
    ['order clustering', clustered('A2') && clustered('B2') && clustered('A1')],
    ['amount DESC', amountDesc('A2') && amountDesc('B2') && amountDesc('A1')],
  ]);
}

// 场景 3：跨行费用填充（佣金 10 在第 1 行、广告费 5 在第 2 行）→ 逐列去重取总 = 15，不重复计费
if (wantScenario(3)) {
  const a3 = rowsOf(rows, 'A3');
  const allSameTotal = a3.every((r) => r2(num(r.order_fee_total)) === 15.0);
  line('[scenario 3] cross-row fee fill (10 + 5)     ', [
    ['order_fee_total=15.00', allSameTotal],
    ['no double counting', sumAlloc(rows, 'A3') === 15.0],
  ]);
}

// 场景 4：零权重订单（金额 0/NULL）→ 分摊 0、比例 0，费用不逃逸
if (wantScenario(4)) {
  const z = rowsOf(rows, 'Z');
  line('[scenario 4] zero-weight order               ', [
    ['allocated_fee=0, alloc_ratio_pct=0', z.every((r) => num(r.allocated_fee) === 0 && num(r.alloc_ratio_pct) === 0)],
  ]);
}

// 三种 mode 各跑一次：quantity/even 全单对平回归（零权重单除外——保护性分摊 0）
const balanceCheck = (mode: FeeAllocateMode, skipOrders: string[]): boolean => {
  const mr = q(sqlFor(mode));
  return mr
    .filter((r) => !skipOrders.includes(r.order_no))
    .every((r) => sumAlloc(mr, r.order_no) === feeTotal(mr, r.order_no));
};
if (!onlyScenario) {
  const qtyOk = balanceCheck('quantity', ['Z']);
  const evenOk = balanceCheck('even', []);
  console.log(`[modes] quantity/even per-order balance       -> ${qtyOk ? 'PASS' : 'FAIL'} / ${evenOk ? 'PASS' : 'FAIL'}`);
  if (!qtyOk || !evenOk) process.exitCode = 1;
}

const pkgVer: string = require('@duckdb/duckdb-wasm/package.json').version;
let engineVer = 'unknown';
try {
  engineVer = String(q('SELECT version() AS v')[0].v);
} catch { /* keep unknown */ }

console.log(`${okCount}/${total} PASS (duckdb-wasm pkg ${pkgVer} / engine ${engineVer} / bundle eh)`);

try { conn.close(); } catch { /* noop */ }
process.exit(okCount === total && !process.exitCode ? 0 : 1);
