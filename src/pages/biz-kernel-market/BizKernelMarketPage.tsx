/**
 * @file BizKernelMarketPage.tsx
 * @description Business kernel market page - main entry for browsing and applying kernels
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Typography, Card, message, Modal } from 'antd';
import SearchBar from './components/SearchBar';
import CategoryFilter from './components/CategoryFilter';
import BizKernelGrid from './components/BizKernelGrid';
import BizKernelDetailModal from './components/BizKernelDetailModal';
import { bizKernelService } from '../../services/biz-kernels/bizKernelService.ts';
import type { BizKernelMetadata } from '../../services/biz-kernels/types';

const { Title } = Typography;

// "All" option constant
const ALL_VALUE = '所有';

const BizKernelMarketPage: React.FC = () => {
  // Service state
  const [initialized, setInitialized] = useState(false);

  // Data state
  const [kernels, setKernels] = useState<BizKernelMetadata[]>([]);
  const [appliedKernelNames, setAppliedKernelNames] = useState<Set<string>>(
    new Set()
  );
  const [industries, setIndustries] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // Filter state
  const [keyword, setKeyword] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState<string>(ALL_VALUE);
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_VALUE);

  // Loading state
  const [loading, setLoading] = useState(true);

  // Detail modal state
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedKernel, setSelectedKernel] =
    useState<BizKernelMetadata | null>(null);

  // Initialize service and load data
  useEffect(() => {
    const init = async () => {
      try {
        await bizKernelService.initialize();
        setInitialized(true);

        // Load initial data
        const allKernels = bizKernelService.getKernelsByPopularity();
        const allIndustries = bizKernelService.getIndustries();
        const allCategories = bizKernelService.getCategories();
        const applied = bizKernelService.getAppliedKernels();

        setKernels(allKernels);
        setIndustries(allIndustries);
        setCategories(allCategories);
        setAppliedKernelNames(new Set(applied.map((k: BizKernelMetadata) => k.name)));
      } catch (error) {
        console.error('[BizKernelMarketPage] Failed to initialize:', error);
        message.error('算子加载失败，请重试');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  // Search and filter
  const handleSearch = useCallback(
    (searchKeyword: string) => {
      setKeyword(searchKeyword);
      setLoading(true);

      try {
        const filter = {
          keyword: searchKeyword || undefined,
          industry:
            selectedIndustry === ALL_VALUE ? undefined : selectedIndustry,
          category:
            selectedCategory === ALL_VALUE ? undefined : selectedCategory,
        };

        const results = bizKernelService.searchKernels(filter);
        // Sorting is already handled by bizKernelService.searchKernels
        // Order: category (ascending) -> likes (descending)
        setKernels(results);
      } catch (error) {
        console.error('[BizKernelMarketPage] Search failed:', error);
      } finally {
        setLoading(false);
      }
    },
    [selectedIndustry, selectedCategory]
  );

  // Handle industry change
  const handleIndustryChange = useCallback(
    (industry: string) => {
      setSelectedIndustry(industry);
      setLoading(true);

      try {
        const filter = {
          keyword: keyword || undefined,
          industry: industry === ALL_VALUE ? undefined : industry,
          category:
            selectedCategory === ALL_VALUE ? undefined : selectedCategory,
        };

        const results = bizKernelService.searchKernels(filter);
        // Sorting is already handled by bizKernelService.searchKernels
        // Order: category (ascending) -> likes (descending)
        setKernels(results);
      } catch (error) {
        console.error('[BizKernelMarketPage] Filter failed:', error);
      } finally {
        setLoading(false);
      }
    },
    [keyword, selectedCategory]
  );

  // Handle category change
  const handleCategoryChange = useCallback(
    (category: string) => {
      setSelectedCategory(category);
      setLoading(true);

      try {
        const filter = {
          keyword: keyword || undefined,
          industry:
            selectedIndustry === ALL_VALUE ? undefined : selectedIndustry,
          category: category === ALL_VALUE ? undefined : category,
        };

        const results = bizKernelService.searchKernels(filter);
        // Sorting is already handled by bizKernelService.searchKernels
        // Order: category (ascending) -> likes (descending)
        setKernels(results);
      } catch (error) {
        console.error('[BizKernelMarketPage] Filter failed:', error);
      } finally {
        setLoading(false);
      }
    },
    [keyword, selectedIndustry]
  );

  // Apply kernel
  const handleApply = useCallback(async (name: string) => {
    try {
      await bizKernelService.applyKernel(name);
      setAppliedKernelNames((prev) => new Set([...prev, name]));
    } catch (error) {
      console.error('[BizKernelMarketPage] Apply failed:', error);
      message.error('算子应用失败');
    }
  }, []);

  // Cancel kernel with confirmation
  const handleCancel = useCallback((name: string) => {
    Modal.confirm({
      title: '确认取消应用',
      content:
        '您已经构建该算子分析流，取消后将无法继续使用，确认取消？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await bizKernelService.cancelKernel(name);
          setAppliedKernelNames((prev) => {
            const next = new Set(prev);
            next.delete(name);
            return next;
          });
        } catch (error) {
          console.error('[BizKernelMarketPage] Cancel failed:', error);
          message.error('取消应用失败');
        }
      },
    });
  }, []);

  // View detail
  const handleViewDetail = useCallback((kernel: BizKernelMetadata) => {
    setSelectedKernel(kernel);
    setDetailModalVisible(true);
  }, []);

  // Close detail modal
  const handleCloseDetail = useCallback(() => {
    setDetailModalVisible(false);
    setSelectedKernel(null);
  }, []);

  if (!initialized) {
    return (
      <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
        <Card loading title="Analysis Hub" />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <Title level={3} style={{ marginBottom: 24 }}>
          Analysis Hub
        </Title>

        {/* Search Bar */}
        <Card style={{ marginBottom: 16, width: '100%' }}>
          <SearchBar onSearch={handleSearch} />
        </Card>

        {/* Category Filter */}
        <Card style={{ marginBottom: 16, width: '100%' }}>
          <CategoryFilter
            industries={industries}
            categories={categories}
            selectedIndustry={selectedIndustry}
            selectedCategory={selectedCategory}
            onIndustryChange={handleIndustryChange}
            onCategoryChange={handleCategoryChange}
          />
        </Card>

        {/* Kernel Grid */}
        <BizKernelGrid
          kernels={kernels}
          appliedKernelNames={appliedKernelNames}
          onApply={handleApply}
          onCancel={handleCancel}
          onViewDetail={handleViewDetail}
          loading={loading}
        />

        {/* Detail Modal */}
        <BizKernelDetailModal
          kernel={selectedKernel}
          isApplied={
            selectedKernel ? appliedKernelNames.has(selectedKernel.name) : false
          }
          visible={detailModalVisible}
          onClose={handleCloseDetail}
          onApply={() => {
            if (selectedKernel) {
              handleApply(selectedKernel.name);
              setDetailModalVisible(false);
            }
          }}
          onCancel={() => {
            if (selectedKernel) {
              handleCancel(selectedKernel.name);
              setDetailModalVisible(false);
            }
          }}
        />
      </div>
    </div>
  );
};

export default BizKernelMarketPage;
