/**
 * @file CategoryFilter.tsx
 * @description Category filter component for biz kernel market
 * Supports industry and attribute classification filtering
 */

import React from 'react';
import { Tag, Space, Typography } from 'antd';


interface CategoryFilterProps {
  industries: string[];
  categories: string[];
  selectedIndustry: string;
  selectedCategory: string;
  onIndustryChange: (industry: string) => void;
  onCategoryChange: (category: string) => void;
}

const { Text } = Typography;

// "All" option constant
const ALL_VALUE = '所有';

const CategoryFilter: React.FC<CategoryFilterProps> = ({
  industries,
  categories,
  selectedIndustry,
  selectedCategory,
  onIndustryChange,
  onCategoryChange,
}) => {
  // Add "All" option to the beginning
  const allIndustries = [ALL_VALUE, ...industries];
  const allCategories = [ALL_VALUE, ...categories];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {/* Industry Classification */}
      <div>
        <Text type="secondary" style={{ marginRight: 12 }}>
          行业分类:
        </Text>
        <Space wrap>
          {allIndustries.map((industry) => (
            <Tag
              key={industry}
              color={selectedIndustry === industry ? 'blue' : undefined}
              style={{
                cursor: 'pointer',
                fontSize: 14,
                padding: '4px 12px',
              }}
              onClick={() => onIndustryChange(industry)}
            >
              {industry}
            </Tag>
          ))}
        </Space>
      </div>

      {/* Attribute Classification */}
      <div>
        <Text type="secondary" style={{ marginRight: 12 }}>
          属性分类:
        </Text>
        <Space wrap>
          {allCategories.map((category) => (
            <Tag
              key={category}
              color={selectedCategory === category ? 'green' : undefined}
              style={{
                cursor: 'pointer',
                fontSize: 14,
                padding: '4px 12px',
              }}
              onClick={() => onCategoryChange(category)}
            >
              {category}
            </Tag>
          ))}
        </Space>
      </div>
    </Space>
  );
};

export default CategoryFilter;
