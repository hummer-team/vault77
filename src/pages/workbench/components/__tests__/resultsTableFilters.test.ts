import { describe, expect, it } from 'vitest';
import {
  applyAdvancedColumnFilter,
  isFilterStateActive,
  type AdvancedColumnFilterState,
} from '../../../../utils/resultsTableFiltersUtils';

describe('resultsTableFilters', () => {
  it('applies numeric between range inclusively', () => {
    const filter: AdvancedColumnFilterState = {
      operator: 'between',
      value: 100,
      valueTo: 500,
    };
    expect(applyAdvancedColumnFilter(100, filter, 'number')).toBe(true);
    expect(applyAdvancedColumnFilter(350, filter, 'number')).toBe(true);
    expect(applyAdvancedColumnFilter(500, filter, 'number')).toBe(true);
    expect(applyAdvancedColumnFilter(99, filter, 'number')).toBe(false);
    expect(applyAdvancedColumnFilter(501, filter, 'number')).toBe(false);
  });

  it('applies text contains and notContains', () => {
    expect(
      applyAdvancedColumnFilter(
        'Order-2026-Alpha',
        { operator: 'contains', value: 'alpha' },
        'text',
      ),
    ).toBe(true);
    expect(
      applyAdvancedColumnFilter(
        'Order-2026-Alpha',
        { operator: 'notContains', value: 'beta' },
        'text',
      ),
    ).toBe(true);
    expect(
      applyAdvancedColumnFilter(
        'Order-2026-Alpha',
        { operator: 'notContains', value: 'alpha' },
        'text',
      ),
    ).toBe(false);
  });

  it('applies date between and relative ranges', () => {
    const between: AdvancedColumnFilterState = {
      operator: 'between',
      value: '2026-05-01',
      valueTo: '2026-05-31',
    };
    expect(applyAdvancedColumnFilter('2026-05-15', between, 'date')).toBe(true);
    expect(applyAdvancedColumnFilter('2026-04-30', between, 'date')).toBe(false);

    const fixedNow = new Date('2026-05-15T00:00:00Z').getTime();
    const last7: AdvancedColumnFilterState = { operator: 'last7' };
    expect(applyAdvancedColumnFilter('2026-05-14', last7, 'date', fixedNow)).toBe(true);
    expect(applyAdvancedColumnFilter('2026-05-01', last7, 'date', fixedNow)).toBe(false);
  });

  it('supports multi-select enum filtering', () => {
    const filter: AdvancedColumnFilterState = {
      operator: 'in',
      values: ['高', '中'],
    };
    expect(applyAdvancedColumnFilter('高', filter, 'enum')).toBe(true);
    expect(applyAdvancedColumnFilter('低', filter, 'enum')).toBe(false);
  });

  it('handles blank and notBlank filters', () => {
    expect(applyAdvancedColumnFilter('', { operator: 'blank' }, 'text')).toBe(true);
    expect(applyAdvancedColumnFilter('x', { operator: 'blank' }, 'text')).toBe(false);
    expect(applyAdvancedColumnFilter('', { operator: 'notBlank' }, 'text')).toBe(false);
    expect(applyAdvancedColumnFilter('x', { operator: 'notBlank' }, 'text')).toBe(true);
  });

  it('detects active filter states correctly', () => {
    expect(isFilterStateActive(undefined)).toBe(false);
    expect(isFilterStateActive({ operator: 'contains', value: '' })).toBe(false);
    expect(isFilterStateActive({ operator: 'contains', value: 'abc' })).toBe(true);
    expect(isFilterStateActive({ operator: 'between', value: 1, valueTo: 2 })).toBe(true);
    expect(isFilterStateActive({ operator: 'in', values: [] })).toBe(false);
    expect(isFilterStateActive({ operator: 'in', values: ['A'] })).toBe(true);
  });
});
