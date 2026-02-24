/**
 * @file SearchBar.tsx
 * @description Search bar component for biz kernel market
 */

import React, { useState, useCallback } from 'react';
import { Input, Button, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

interface SearchBarProps {
  onSearch: (keyword: string) => void;
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  placeholder = '搜索算子名称、描述、分类...',
}) => {
  const [keyword, setKeyword] = useState('');

  const handleSearch = useCallback(() => {
    onSearch(keyword.trim());
  }, [keyword, onSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    },
    [handleSearch]
  );

  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        allowClear
        size="large"
      />
      <Button
        type="primary"
        icon={<SearchOutlined />}
        onClick={handleSearch}
        size="large"
      >
        搜索
      </Button>
    </Space.Compact>
  );
};

export default SearchBar;
