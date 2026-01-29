/**
 * @file testCases.ts
 * @description Test dataset for intent recognition validation.
 * Covers 20 test cases from refactor3.md Use Cases U1-U5.
 * 
 * Part of M11.0 Refactor3: Skill Framework - Phase 2
 */

import { BusinessEntityType } from '../entities';
import { recognizeIntent, recommendSkills } from './intentRecognizer';

/**
 * Test case structure.
 */
export interface IntentTestCase {
  /** Test case ID */
  id: string;
  
  /** User input query */
  input: string;
  
  /** Expected entity type */
  expectedEntity: BusinessEntityType;
  
  /** Expected confidence range */
  expectedConfidence: {
    min: number;
    max: number;
  };
  
  /** Test case description */
  description: string;
}

/**
 * Test dataset (20 cases covering all scenarios).
 */
export const INTENT_TEST_CASES: IntentTestCase[] = [
  // === ORDER Entity Tests (Case U1) ===
  {
    id: 'U1-1',
    input: '最近30天的订单趋势',
    expectedEntity: BusinessEntityType.ORDER,
    expectedConfidence: { min: 0.3, max: 1.0 },
    description: 'Order trend query with time filter',
  },
  {
    id: 'U1-2',
    input: '今天的GMV是多少',
    expectedEntity: BusinessEntityType.ORDER,
    expectedConfidence: { min: 0.3, max: 1.0 },
    description: 'GMV query (order metric)',
  },
  {
    id: 'U1-3',
    input: '查询支付状态为已支付的订单',
    expectedEntity: BusinessEntityType.ORDER,
    expectedConfidence: { min: 0.7, max: 1.0 },
    description: 'Order query with payment status filter',
  },
  {
    id: 'U1-4',
    input: '统计本月订单量',
    expectedEntity: BusinessEntityType.ORDER,
    expectedConfidence: { min: 0.5, max: 1.0 },
    description: 'Order count statistics',
  },

  // === USER Entity Tests (Case U2) ===
  {
    id: 'U2-1',
    input: '用户复购率分析',
    expectedEntity: BusinessEntityType.USER,
    expectedConfidence: { min: 0.6, max: 1.0 },
    description: 'User repurchase rate analysis',
  },
  {
    id: 'U2-2',
    input: '活跃用户数量趋势',
    expectedEntity: BusinessEntityType.USER,
    expectedConfidence: { min: 0.7, max: 1.0 },
    description: 'Active user count trend',
  },
  {
    id: 'U2-3',
    input: '会员等级分布',
    expectedEntity: BusinessEntityType.USER,
    expectedConfidence: { min: 0.6, max: 1.0 },
    description: 'Member level distribution',
  },
  {
    id: 'U2-4',
    input: '新注册用户统计',
    expectedEntity: BusinessEntityType.USER,
    expectedConfidence: { min: 0.6, max: 1.0 },
    description: 'New user registration statistics',
  },

  // === PRODUCT Entity Tests (Case U3) ===
  {
    id: 'U3-1',
    input: '商品销量排行',
    expectedEntity: BusinessEntityType.PRODUCT,
    expectedConfidence: { min: 0.5, max: 1.0 },
    description: 'Product sales ranking',
  },
  {
    id: 'U3-2',
    input: '热销商品Top10',
    expectedEntity: BusinessEntityType.PRODUCT,
    expectedConfidence: { min: 0.7, max: 1.0 },
    description: 'Top 10 hot-selling products',
  },
  {
    id: 'U3-3',
    input: 'SKU库存查询',
    expectedEntity: BusinessEntityType.PRODUCT,
    expectedConfidence: { min: 0.5, max: 1.0 },
    description: 'SKU stock query (ambiguous: PRODUCT vs INVENTORY)',
  },
  {
    id: 'U3-4',
    input: '品类销售额占比',
    expectedEntity: BusinessEntityType.PRODUCT,
    expectedConfidence: { min: 0.5, max: 1.0 },
    description: 'Category sales percentage',
  },

  // === GENERAL Entity Tests (Case U4) ===
  {
    id: 'U4-1',
    input: '查询数据',
    expectedEntity: BusinessEntityType.GENERAL,
    expectedConfidence: { min: 0.3, max: 0.7 },
    description: 'Generic query without specific entity',
  },
  {
    id: 'U4-2',
    input: '统计总数',
    expectedEntity: BusinessEntityType.GENERAL,
    expectedConfidence: { min: 0.3, max: 0.7 },
    description: 'Generic count query',
  },
  {
    id: 'U4-3',
    input: '显示列表',
    expectedEntity: BusinessEntityType.GENERAL,
    expectedConfidence: { min: 0.3, max: 0.7 },
    description: 'Generic list display',
  },

  // === Ambiguous Query Tests (Case U5) ===
  {
    id: 'U5-1',
    input: '买东西记录',
    expectedEntity: BusinessEntityType.ORDER,
    expectedConfidence: { min: 0.3, max: 0.9 },
    description: 'Ambiguous purchase record query',
  },
  {
    id: 'U5-2',
    input: '消费金额统计',
    expectedEntity: BusinessEntityType.ORDER,
    expectedConfidence: { min: 0.4, max: 0.9 },
    description: 'Ambiguous consumption amount (ORDER or USER or FINANCE)',
  },

  // === Additional Entity Tests ===
  {
    id: 'INV-1',
    input: '仓库库存预警',
    expectedEntity: BusinessEntityType.INVENTORY,
    expectedConfidence: { min: 0.7, max: 1.0 },
    description: 'Warehouse inventory alert',
  },
  {
    id: 'FIN-1',
    input: '本月利润分析',
    expectedEntity: BusinessEntityType.FINANCE,
    expectedConfidence: { min: 0.3, max: 1.0 },
    description: 'Monthly profit analysis',
  },
  {
    id: 'LOG-1',
    input: '物流签收率统计',
    expectedEntity: BusinessEntityType.LOGISTICS,
    expectedConfidence: { min: 0.7, max: 1.0 },
    description: 'Logistics delivery rate statistics',
  },
];

/**
 * Run all intent recognition tests.
 * @returns Test results summary
 */
export function runIntentTests(): {
  passed: number;
  failed: number;
  accuracy: number;
  details: Array<{
    testCase: IntentTestCase;
    actual: ReturnType<typeof recognizeIntent>;
    passed: boolean;
    reason?: string;
  }>;
} {
  const results: Array<{
    testCase: IntentTestCase;
    actual: ReturnType<typeof recognizeIntent>;
    passed: boolean;
    reason?: string;
  }> = [];

  let passed = 0;
  let failed = 0;

  for (const testCase of INTENT_TEST_CASES) {
    const actual = recognizeIntent(testCase.input);
    
    // Check entity type match
    const entityMatch = actual.entityType === testCase.expectedEntity;
    
    // Check confidence range
    const confidenceMatch =
      actual.confidence >= testCase.expectedConfidence.min &&
      actual.confidence <= testCase.expectedConfidence.max;

    const testPassed = entityMatch && confidenceMatch;

    if (testPassed) {
      passed++;
    } else {
      failed++;
    }

    results.push({
      testCase,
      actual,
      passed: testPassed,
      reason: !entityMatch
        ? `Expected ${testCase.expectedEntity}, got ${actual.entityType}`
        : !confidenceMatch
        ? `Confidence ${actual.confidence.toFixed(2)} not in range [${testCase.expectedConfidence.min}, ${testCase.expectedConfidence.max}]`
        : undefined,
    });
  }

  const accuracy = (passed / INTENT_TEST_CASES.length) * 100;

  return {
    passed,
    failed,
    accuracy,
    details: results,
  };
}

/**
 * Print test results to console.
 */
export function printTestResults(): void {
  console.log('\n=== Intent Recognition Test Results ===\n');

  const { passed, failed, accuracy, details } = runIntentTests();

  console.log(`Total Tests: ${INTENT_TEST_CASES.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Accuracy: ${accuracy.toFixed(2)}%`);
  console.log(`Target: ≥95%`);
  console.log(`Status: ${accuracy >= 95 ? '✅ PASS' : '❌ FAIL'}\n`);

  // Print failed cases
  if (failed > 0) {
    console.log('Failed Cases:\n');
    details
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`[${r.testCase.id}] ${r.testCase.input}`);
        console.log(`  Expected: ${r.testCase.expectedEntity} (confidence ${r.testCase.expectedConfidence.min}-${r.testCase.expectedConfidence.max})`);
        console.log(`  Actual: ${r.actual.entityType} (confidence ${r.actual.confidence.toFixed(2)})`);
        console.log(`  Matched: ${r.actual.matchedKeywords.slice(0, 5).join(', ')}${r.actual.matchedKeywords.length > 5 ? '...' : ''}`);
        console.log(`  Reason: ${r.reason}\n`);
      });
  }

  // Print skill recommendation samples
  console.log('Skill Recommendation Samples:\n');
  const samples = [
    INTENT_TEST_CASES[0], // ORDER
    INTENT_TEST_CASES[4], // USER
    INTENT_TEST_CASES[8], // PRODUCT
  ];

  samples.forEach((testCase) => {
    const intent = recognizeIntent(testCase.input);
    const recommendation = recommendSkills(intent);
    console.log(`[${testCase.id}] ${testCase.input}`);
    console.log(`  Primary: ${recommendation.primary}`);
    console.log(`  Related: ${recommendation.related.join(', ')}\n`);
  });
}
