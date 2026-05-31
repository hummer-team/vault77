/**
 * @file KernelPickerPanel.tsx
 * @description Shared kernel picker UI used by both ChatPanel (Mentions popupRender)
 * and StepGuidePanel (Popover content). Features: fixed search box at top, recent-use
 * section, category-grouped list, all filtered in real-time.
 */

import React, { useState, useCallback } from 'react';
import { Input } from 'antd';
import { SearchOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { BizKernelMetadata } from '../../services/biz-kernels/types';
import { CATEGORY_SORT_ORDER } from '../../services/biz-kernels/types';
import { useKernelPickerStore, RecentKernelEntry } from '../../stores/kernelPickerStore';

interface KernelPickerPanelProps {
  /** Available kernels to display (applied kernels only). */
  kernels: BizKernelMetadata[];
  /** Callback when a kernel item is selected. */
  onSelect: (kernelName: string) => void;
  /** Panel width in pixels. Defaults to 280. */
  width?: number;
}

/** Normalize text for case-insensitive substring matching. */
function normalize(s: string): string {
  return s.toLowerCase();
}

/** Check if a kernel matches the search text. */
function matchesSearch(kernel: BizKernelMetadata, search: string): boolean {
  if (!search) return true;
  const q = normalize(search);
  return normalize(kernel.displayName).includes(q) || normalize(kernel.description).includes(q);
}

const SCROLL_AREA_MAX_HEIGHT = 320;

const KernelPickerPanel: React.FC<KernelPickerPanelProps> = ({ kernels, onSelect, width = 280 }) => {
  const [searchText, setSearchText] = useState('');
  const { recentKernels, addRecentKernel } = useKernelPickerStore();

  const handleSelect = useCallback(
    (name: string) => {
      addRecentKernel(name);
      onSelect(name);
    },
    [addRecentKernel, onSelect]
  );

  // --- Recent section ---
  // Build a lookup map for recent kernel metadata
  const kernelByName = new Map<string, BizKernelMetadata>(kernels.map((k) => [k.name, k]));

  const filteredRecent = recentKernels.filter((r: RecentKernelEntry) => {
    if (!kernelByName.has(r.name)) return false;
    if (!searchText) return true;
    const meta = kernelByName.get(r.name)!;
    return matchesSearch(meta, searchText);
  });

  // --- Category groups ---
  // Group kernels by category, filter by search, sort groups by CATEGORY_SORT_ORDER
  const grouped = new Map<string, BizKernelMetadata[]>();
  for (const k of kernels) {
    if (!matchesSearch(k, searchText)) continue;
    if (!grouped.has(k.category)) grouped.set(k.category, []);
    grouped.get(k.category)!.push(k);
  }

  const sortedCategories = [...grouped.keys()].sort((a, b) => {
    const orderA = CATEGORY_SORT_ORDER[a as keyof typeof CATEGORY_SORT_ORDER] ?? 999;
    const orderB = CATEGORY_SORT_ORDER[b as keyof typeof CATEGORY_SORT_ORDER] ?? 999;
    return orderA - orderB;
  });

  const hasResults = filteredRecent.length > 0 || sortedCategories.length > 0;

  return (
    <div
      style={{
        width,
        background: 'var(--vm-bg-base)',
        border: '1px solid var(--vm-border-mid)',
        borderRadius: 8,
        boxShadow: 'var(--vm-flow-shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Fixed search box */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--vm-border-subtle)',
          flexShrink: 0,
        }}
      >
        <Input
          size="small"
          prefix={<SearchOutlined style={{ color: 'var(--vm-text-muted)', fontSize: 12 }} />}
          placeholder="搜索算子…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--vm-border-subtle)',
            color: 'var(--vm-text-primary)',
            borderRadius: 5,
          }}
          autoFocus
        />
      </div>

      {/* Scrollable list area */}
      <div
        style={{
          maxHeight: SCROLL_AREA_MAX_HEIGHT,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {!hasResults && (
          <div
            style={{
              padding: '24px 0',
              textAlign: 'center',
              color: 'var(--vm-text-muted)',
              fontSize: 12,
            }}
          >
            未找到匹配的算子
          </div>
        )}

        {/* Recent section */}
        {filteredRecent.length > 0 && (
          <section>
            <SectionHeader icon={<ClockCircleOutlined />} label="最近使用" />
            {filteredRecent.map((r: RecentKernelEntry) => {
              const meta = kernelByName.get(r.name);
              if (!meta) return null;
              return (
                <KernelItem
                  key={r.name}
                  kernel={meta}
                  onSelect={handleSelect}
                />
              );
            })}
          </section>
        )}

        {/* Category groups */}
        {sortedCategories.map((cat) => {
          const items = grouped.get(cat)!;
          return (
            <section key={cat}>
              <SectionHeader label={cat} />
              {items.map((k) => (
                <KernelItem key={k.name} kernel={k} onSelect={handleSelect} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  label: string;
  icon?: React.ReactNode;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ label, icon }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '6px 12px 3px',
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--vm-text-muted)',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      userSelect: 'none',
      cursor: 'default',
    }}
  >
    {icon && <span style={{ fontSize: 11 }}>{icon}</span>}
    {label}
  </div>
);

interface KernelItemProps {
  kernel: BizKernelMetadata;
  onSelect: (name: string) => void;
}

const KernelItem: React.FC<KernelItemProps> = ({ kernel, onSelect }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="option"
      aria-selected={false}
      onClick={() => onSelect(kernel.name)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        padding: '7px 14px',
        cursor: 'pointer',
        background: hovered ? 'var(--vm-primary-light)' : 'transparent',
        borderLeft: hovered ? '2px solid var(--vm-primary)' : '2px solid transparent',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: hovered ? 'var(--vm-primary-hover)' : 'var(--vm-text-primary)',
          lineHeight: '18px',
          transition: 'color 0.15s',
        }}
      >
        {kernel.displayName}
      </span>
      <span
        style={{
          fontSize: 11,
          color: 'var(--vm-text-secondary)',
          lineHeight: '16px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {kernel.description}
      </span>
    </div>
  );
};

export default KernelPickerPanel;
