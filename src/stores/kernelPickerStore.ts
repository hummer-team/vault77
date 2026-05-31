/**
 * @file kernelPickerStore.ts
 * @description Session-only Zustand store for tracking recently used kernels in the picker UI.
 * State is not persisted — clears on page reload.
 */

import { create } from 'zustand';

/** A recently-used kernel entry with usage count for sorting. */
export interface RecentKernelEntry {
  /** Internal kernel name (matches BizKernelMetadata.name) */
  name: string;
  /** Number of times selected in this session */
  count: number;
}

const MAX_RECENT = 5;

interface KernelPickerState {
  /** Recently used kernels, sorted by count descending, max MAX_RECENT entries. */
  recentKernels: RecentKernelEntry[];
  /**
   * Record a kernel selection.
   * - If already present: increment count, re-sort.
   * - If new: prepend with count=1, trim to MAX_RECENT.
   * Sort order: count descending (highest usage first).
   */
  addRecentKernel: (name: string) => void;
}

export const useKernelPickerStore = create<KernelPickerState>((set) => ({
  recentKernels: [],

  addRecentKernel: (name: string) =>
    set((state) => {
      const existing = state.recentKernels.find((e) => e.name === name);
      let updated: RecentKernelEntry[];

      if (existing) {
        updated = state.recentKernels.map((e) =>
          e.name === name ? { ...e, count: e.count + 1 } : e
        );
      } else {
        updated = [{ name, count: 1 }, ...state.recentKernels];
      }

      // Sort by count descending, then trim to max
      updated.sort((a, b) => b.count - a.count);
      return { recentKernels: updated.slice(0, MAX_RECENT) };
    }),
}));
