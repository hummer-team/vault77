/**
 * @file BizKernelGrid.tsx
 * @description Business kernel grid with infinite scroll
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Row, Col, Spin, Empty } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import BizKernelCard from './BizKernelCard';
import type { BizKernelMetadata } from '../../../services/biz-kernels/types';

interface BizKernelGridProps {
  kernels: BizKernelMetadata[];
  appliedKernelNames: Set<string>;
  onApply: (name: string) => void;
  onCancel: (name: string) => void;
  onViewDetail: (kernel: BizKernelMetadata) => void;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

// Number of kernels per row (responsive)
const GRID_COL_SPAN = {
  xs: 24, // 1 column on mobile
  sm: 12, // 2 columns on small screens
  md: 8,  // 3 columns on medium screens
  lg: 6,  // 4 columns on large screens
  xl: 6,  // 4 columns on extra large screens
};

const BizKernelGrid: React.FC<BizKernelGridProps> = ({
  kernels,
  appliedKernelNames,
  onApply,
  onCancel,
  onViewDetail,
  loading = false,
  hasMore = false,
  onLoadMore,
}) => {
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (loading || isLoadingMore || !hasMore || !onLoadMore) return;

    const scrollHeight = document.documentElement.scrollHeight;
    const scrollTop = document.documentElement.scrollTop;
    const clientHeight = document.documentElement.clientHeight;

    // Trigger load more when scrolling to bottom (100px threshold)
    if (scrollHeight - scrollTop - clientHeight < 100) {
      setIsLoadingMore(true);
      onLoadMore();
    }
  }, [loading, isLoadingMore, hasMore, onLoadMore]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Reset loading more state when kernels update
  useEffect(() => {
    setIsLoadingMore(false);
  }, [kernels.length]);

  if (loading && kernels.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 64 }}>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
      </div>
    );
  }

  if (kernels.length === 0) {
    return (
      <Empty
        description="呃，无法找到你需要的算子，请尝试修改搜索关键字"
        style={{ padding: 64, minHeight: 300 }}
      />
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <Row gutter={[16, 16]} style={{ width: '100%' }}>
        {kernels.map((kernel) => (
          <Col key={kernel.name} {...GRID_COL_SPAN}>
            <BizKernelCard
              kernel={kernel}
              isApplied={appliedKernelNames.has(kernel.name)}
              onApply={() => onApply(kernel.name)}
              onCancel={() => onCancel(kernel.name)}
              onViewDetail={() => onViewDetail(kernel)}
            />
          </Col>
        ))}
      </Row>

      {/* Loading more indicator */}
      {(isLoadingMore || loading) && kernels.length > 0 && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
        </div>
      )}

      {/* No more data indicator */}
      {!hasMore && kernels.length > 0 && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <span style={{ color: '#999' }}>没有更多了</span>
        </div>
      )}
    </div>
  );
};

export default BizKernelGrid;
