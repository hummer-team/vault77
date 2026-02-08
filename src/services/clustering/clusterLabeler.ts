/**
 * RFM Cluster Labeler
 * Assigns business-meaningful labels to customer clusters based on RFM characteristics
 * 
 * Uses classic RFM segmentation theory with 11 customer archetypes:
 * - Champions: Best customers (high R, F, M)
 * - Loyal Customers: Regular buyers (high F, M)
 * - Potential Loyalists: Recent high spenders (high R, M)
 * - Recent Customers: New buyers (high R)
 * - Promising: Recent buyers with potential (high R, low F)
 * - Need Attention: Average customers slipping (medium R, F, M)
 * - About to Sleep: Below average, declining (low R, F, M)
 * - At Risk: Used to be good, haven't returned (low R, high F, M)
 * - Can't Lose Them: Made big purchases, long time ago (very low R, high M)
 * - Hibernating: Last purchase long ago, low spenders (very low R, F, low M)
 * - Lost: Gone, lowest scores (very low R, F, M)
 */

import type { ClusterMetadata } from '../../types/clustering.types';

/**
 * RFM customer classification with metadata
 */
export interface RFMClassification {
  label: string;              // English label (used in charts)
  labelCn: string;            // Chinese label (for tooltips)
  description: string;        // Business description
  color: string;              // Suggested color (hex)
  priority: number;           // Business priority (1=highest, 11=lowest)
}

/**
 * 11 classic RFM customer archetypes
 */
const RFM_ARCHETYPES: Record<string, RFMClassification> = {
  champions: {
    label: 'Champions',
    labelCn: '冠军客户',
    description: 'Best customers: recent, frequent, high-value purchases',
    color: '#52c41a',
    priority: 1,
  },
  loyal: {
    label: 'Loyal Customers',
    labelCn: '忠诚客户',
    description: 'Regular buyers with consistent high value',
    color: '#73d13d',
    priority: 2,
  },
  potentialLoyalists: {
    label: 'Potential Loyalists',
    labelCn: '潜力客户',
    description: 'Recent high spenders, build frequency',
    color: '#95de64',
    priority: 3,
  },
  recentCustomers: {
    label: 'Recent Customers',
    labelCn: '新客户',
    description: 'New buyers, nurture engagement',
    color: '#1890ff',
    priority: 4,
  },
  promising: {
    label: 'Promising',
    labelCn: '有潜力',
    description: 'Recent buyers with growth potential',
    color: '#40a9ff',
    priority: 5,
  },
  needAttention: {
    label: 'Need Attention',
    labelCn: '需要关注',
    description: 'Average customers showing signs of decline',
    color: '#faad14',
    priority: 6,
  },
  aboutToSleep: {
    label: 'About to Sleep',
    labelCn: '即将流失',
    description: 'Below average, at risk of churning',
    color: '#ffc53d',
    priority: 7,
  },
  atRisk: {
    label: 'At Risk',
    labelCn: '流失风险',
    description: 'Used to be good customers, re-engage urgently',
    color: '#ff7a45',
    priority: 8,
  },
  cantLoseThem: {
    label: "Can't Lose Them",
    labelCn: '不能失去',
    description: 'High-value customers lost long ago, win back',
    color: '#ff4d4f',
    priority: 9,
  },
  hibernating: {
    label: 'Hibernating',
    labelCn: '休眠客户',
    description: 'Long-inactive low spenders',
    color: '#d9d9d9',
    priority: 10,
  },
  lost: {
    label: 'Lost',
    labelCn: '已流失',
    description: 'Lowest engagement, likely gone',
    color: '#8c8c8c',
    priority: 11,
  },
};

/**
 * Calculate percentile thresholds for RFM dimensions across all clusters
 * Returns [33rd percentile, 66th percentile] for each dimension
 */
function calculateRFMPercentiles(clusters: ClusterMetadata[]): {
  recency: [number, number];
  frequency: [number, number];
  monetary: [number, number];
} {
  const recencies = clusters.map(c => c.avgRecency).filter(v => v > 0).sort((a, b) => a - b);
  const frequencies = clusters.map(c => c.avgFrequency).filter(v => v > 0).sort((a, b) => a - b);
  const monetaries = clusters.map(c => c.avgMonetary).filter(v => v > 0).sort((a, b) => a - b);

  const getPercentile = (arr: number[], p: number): number => {
    if (arr.length === 0) return 0;
    const idx = Math.floor(arr.length * p);
    return arr[Math.min(idx, arr.length - 1)];
  };

  return {
    recency: [getPercentile(recencies, 0.33), getPercentile(recencies, 0.66)],
    frequency: [getPercentile(frequencies, 0.33), getPercentile(frequencies, 0.66)],
    monetary: [getPercentile(monetaries, 0.33), getPercentile(monetaries, 0.66)],
  };
}

/**
 * Convert RFM values to scores (1-3) based on percentiles
 * Note: For Recency, LOWER is BETTER (recent purchase), so scoring is inverted
 */
function scoreRFM(
  recency: number,
  frequency: number,
  monetary: number,
  percentiles: ReturnType<typeof calculateRFMPercentiles>
): { R: number; F: number; M: number } {
  // Recency: Lower is better (1 = low recency = recent)
  let R: number;
  if (recency <= percentiles.recency[0]) {
    R = 3; // Recent (best)
  } else if (recency <= percentiles.recency[1]) {
    R = 2; // Medium
  } else {
    R = 1; // Long ago (worst)
  }

  // Frequency: Higher is better
  let F: number;
  if (frequency >= percentiles.frequency[1]) {
    F = 3; // High frequency (best)
  } else if (frequency >= percentiles.frequency[0]) {
    F = 2; // Medium
  } else {
    F = 1; // Low frequency (worst)
  }

  // Monetary: Higher is better
  let M: number;
  if (monetary >= percentiles.monetary[1]) {
    M = 3; // High value (best)
  } else if (monetary >= percentiles.monetary[0]) {
    M = 2; // Medium
  } else {
    M = 1; // Low value (worst)
  }

  return { R, F, M };
}

/**
 * Map RFM scores to customer archetype
 * Based on classic RFM segmentation rules
 */
function mapScoresToArchetype(R: number, F: number, M: number): keyof typeof RFM_ARCHETYPES {
  // Champions: R=3, F=3, M=3
  if (R === 3 && F === 3 && M === 3) return 'champions';
  
  // Loyal Customers: F=3, M=3 (any R)
  if (F === 3 && M === 3) return 'loyal';
  
  // Potential Loyalists: R=3, M>=2, F<3
  if (R === 3 && M >= 2 && F < 3) return 'potentialLoyalists';
  
  // Recent Customers: R=3, F=1, M=1
  if (R === 3 && F === 1 && M === 1) return 'recentCustomers';
  
  // Promising: R=3, F<=2, M<=2
  if (R === 3 && F <= 2 && M <= 2) return 'promising';
  
  // Need Attention: R=2, F=2, M=2
  if (R === 2 && F === 2 && M === 2) return 'needAttention';
  
  // About to Sleep: R<=2, F<=2, M<=2
  if (R <= 2 && F <= 2 && M <= 2) return 'aboutToSleep';
  
  // At Risk: R=1, F>=2, M>=2
  if (R === 1 && F >= 2 && M >= 2) return 'atRisk';
  
  // Can't Lose Them: R=1, M=3
  if (R === 1 && M === 3) return 'cantLoseThem';
  
  // Hibernating: R=1, F=1, M>=2
  if (R === 1 && F === 1 && M >= 2) return 'hibernating';
  
  // Lost: R=1, F=1, M=1
  if (R === 1 && F === 1 && M === 1) return 'lost';
  
  // Default: classify based on total score
  const total = R + F + M;
  if (total >= 8) return 'loyal';
  if (total >= 6) return 'needAttention';
  return 'aboutToSleep';
}

/**
 * Assign business-meaningful label to a cluster
 * @param cluster The cluster to label
 * @param allClusters All clusters (for percentile calculation)
 * @returns RFM classification with label and metadata
 */
export function labelCluster(
  cluster: ClusterMetadata,
  allClusters: ClusterMetadata[]
): RFMClassification {
  // Handle empty clusters
  if (cluster.customerCount === 0) {
    return {
      label: 'Empty Cluster',
      labelCn: '空集群',
      description: 'No customers in this cluster',
      color: '#f0f0f0',
      priority: 99,
    };
  }

  // Calculate global percentiles
  const percentiles = calculateRFMPercentiles(allClusters);

  // Score this cluster's RFM values
  const scores = scoreRFM(
    cluster.avgRecency,
    cluster.avgFrequency,
    cluster.avgMonetary,
    percentiles
  );

  // Map to archetype
  const archetypeKey = mapScoresToArchetype(scores.R, scores.F, scores.M);
  const classification = RFM_ARCHETYPES[archetypeKey];

  console.log(
    `[ClusterLabeler] Cluster ${cluster.clusterId}: R=${scores.R} F=${scores.F} M=${scores.M} → ${classification.label}`
  );

  return classification;
}

/**
 * Batch label all clusters
 * @param clusters Array of clusters to label
 * @returns Array of classifications in same order
 */
export function labelAllClusters(clusters: ClusterMetadata[]): RFMClassification[] {
  return clusters.map(cluster => labelCluster(cluster, clusters));
}
