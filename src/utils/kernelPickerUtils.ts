import { bizKernelService } from '../services/biz-kernels/bizKernelService';

/** A single kernel option for use in UI pickers (Dropdown, Mentions, etc.) */
export interface KernelPickerOption {
  /** displayName — used as the Mentions trigger value */
  value: string;
  /** Human-readable label displayed in the picker list */
  label: string;
  /** Internal kernel name passed to bizKernelService / onKernelSelected */
  kernelName: string;
}

/**
 * Returns the list of currently applied kernels as picker-ready option objects.
 * Used by ChatPanel (Mentions "/" trigger) and StepGuidePanel (button dropdown).
 * Returns an empty array if no kernels are applied or the service is unavailable.
 */
export function getKernelPickerOptions(): KernelPickerOption[] {
  try {
    const applied = bizKernelService.getAppliedKernels();
    return applied.map(k => ({
      value: k.displayName,
      label: `${k.category} · ${k.displayName}`,
      kernelName: k.name,
    }));
  } catch {
    return [];
  }
}
