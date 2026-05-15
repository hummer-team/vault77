export type ColumnFilterKind = 'text' | 'number' | 'date' | 'boolean' | 'enum';

export interface AdvancedColumnFilterState {
  operator:
    | 'contains'
    | 'notContains'
    | 'equals'
    | 'notEquals'
    | 'startsWith'
    | 'endsWith'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'between'
    | 'in'
    | 'blank'
    | 'notBlank'
    | 'on'
    | 'before'
    | 'after'
    | 'last7'
    | 'last30'
    | 'last90';
  value?: string | number;
  valueTo?: string | number;
  values?: Array<string | number | boolean>;
}

const isBlank = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  return String(value).trim() === '';
};

const parseNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDateMs = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(String(value));
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

const compareText = (rawValue: unknown, state: AdvancedColumnFilterState): boolean => {
  const source = String(rawValue ?? '').toLowerCase();
  const query = String(state.value ?? '').toLowerCase();
  switch (state.operator) {
    case 'contains':
      return source.includes(query);
    case 'notContains':
      return !source.includes(query);
    case 'equals':
      return source === query;
    case 'notEquals':
      return source !== query;
    case 'startsWith':
      return source.startsWith(query);
    case 'endsWith':
      return source.endsWith(query);
    default:
      return true;
  }
};

const compareNumber = (rawValue: unknown, state: AdvancedColumnFilterState): boolean => {
  const value = parseNumber(rawValue);
  if (value === null) return false;
  const target = parseNumber(state.value);
  const upper = parseNumber(state.valueTo);
  switch (state.operator) {
    case 'equals':
      return target !== null ? value === target : true;
    case 'notEquals':
      return target !== null ? value !== target : true;
    case 'gt':
      return target !== null ? value > target : true;
    case 'gte':
      return target !== null ? value >= target : true;
    case 'lt':
      return target !== null ? value < target : true;
    case 'lte':
      return target !== null ? value <= target : true;
    case 'between': {
      if (target === null || upper === null) return true;
      const min = Math.min(target, upper);
      const max = Math.max(target, upper);
      return value >= min && value <= max;
    }
    default:
      return true;
  }
};

const isSameDay = (leftMs: number, rightMs: number): boolean => {
  const left = new Date(leftMs);
  const right = new Date(rightMs);
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
};

const compareDate = (
  rawValue: unknown,
  state: AdvancedColumnFilterState,
  nowMs: number,
): boolean => {
  const valueMs = parseDateMs(rawValue);
  if (valueMs === null) return false;
  const startMs = parseDateMs(state.value);
  const endMs = parseDateMs(state.valueTo);
  switch (state.operator) {
    case 'on':
      return startMs !== null ? isSameDay(valueMs, startMs) : true;
    case 'before':
      return startMs !== null ? valueMs < startMs : true;
    case 'after':
      return startMs !== null ? valueMs > startMs : true;
    case 'between': {
      if (startMs === null || endMs === null) return true;
      const min = Math.min(startMs, endMs);
      const max = Math.max(startMs, endMs);
      return valueMs >= min && valueMs <= max;
    }
    case 'last7':
      return valueMs >= nowMs - 7 * 24 * 60 * 60 * 1000;
    case 'last30':
      return valueMs >= nowMs - 30 * 24 * 60 * 60 * 1000;
    case 'last90':
      return valueMs >= nowMs - 90 * 24 * 60 * 60 * 1000;
    default:
      return true;
  }
};

export const isFilterStateActive = (state: AdvancedColumnFilterState | undefined): boolean => {
  if (!state) return false;
  if (state.operator === 'blank' || state.operator === 'notBlank') return true;
  if (state.operator === 'last7' || state.operator === 'last30' || state.operator === 'last90') return true;
  if (state.operator === 'in') return Array.isArray(state.values) && state.values.length > 0;
  if (state.operator === 'between') return state.value !== undefined && state.valueTo !== undefined && state.value !== '' && state.valueTo !== '';
  return state.value !== undefined && state.value !== '';
};

export const applyAdvancedColumnFilter = (
  rawValue: unknown,
  state: AdvancedColumnFilterState | undefined,
  kind: ColumnFilterKind,
  nowMs: number = Date.now(),
): boolean => {
  if (!state || !isFilterStateActive(state)) return true;
  if (state.operator === 'blank') return isBlank(rawValue);
  if (state.operator === 'notBlank') return !isBlank(rawValue);
  if (state.operator === 'in') {
    if (!Array.isArray(state.values) || state.values.length === 0) return true;
    return state.values.some((v) => String(v) === String(rawValue));
  }

  if (kind === 'number') return compareNumber(rawValue, state);
  if (kind === 'date') return compareDate(rawValue, state, nowMs);
  if (kind === 'boolean' || kind === 'enum' || kind === 'text') return compareText(rawValue, state);
  return true;
};

export const getDistinctColumnValues = (
  rows: Array<Record<string, unknown>>,
  columnName: string,
  limit = 200,
): string[] => {
  const values = new Set<string>();
  for (const row of rows) {
    const value = row[columnName];
    if (value === null || value === undefined || value === '') continue;
    values.add(String(value));
    if (values.size >= limit) break;
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
};
