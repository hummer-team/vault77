import { describe, it, expect, beforeEach } from 'bun:test';
import { useKernelPickerStore } from '../kernelPickerStore';

/** Reset store state between tests */
function resetStore() {
  useKernelPickerStore.setState({ recentKernels: [] });
}

describe('kernelPickerStore', () => {
  beforeEach(resetStore);

  it('should start with empty recentKernels', () => {
    expect(useKernelPickerStore.getState().recentKernels).toEqual([]);
  });

  it('should add a new kernel with count=1', () => {
    useKernelPickerStore.getState().addRecentKernel('fn_ecom_rfm_profile');
    const { recentKernels } = useKernelPickerStore.getState();
    expect(recentKernels).toHaveLength(1);
    expect(recentKernels[0]).toEqual({ name: 'fn_ecom_rfm_profile', count: 1 });
  });

  it('should increment count when same kernel is added again', () => {
    const { addRecentKernel } = useKernelPickerStore.getState();
    addRecentKernel('fn_ecom_rfm_profile');
    addRecentKernel('fn_ecom_rfm_profile');
    addRecentKernel('fn_ecom_rfm_profile');
    const { recentKernels } = useKernelPickerStore.getState();
    expect(recentKernels).toHaveLength(1);
    expect(recentKernels[0].count).toBe(3);
  });

  it('should sort by count descending', () => {
    const { addRecentKernel } = useKernelPickerStore.getState();
    addRecentKernel('kernel_a');
    addRecentKernel('kernel_b');
    addRecentKernel('kernel_b');
    addRecentKernel('kernel_c');
    addRecentKernel('kernel_c');
    addRecentKernel('kernel_c');
    const { recentKernels } = useKernelPickerStore.getState();
    expect(recentKernels[0].name).toBe('kernel_c');
    expect(recentKernels[0].count).toBe(3);
    expect(recentKernels[1].name).toBe('kernel_b');
    expect(recentKernels[2].name).toBe('kernel_a');
  });

  it('should cap at 5 entries and drop the 6th', () => {
    const { addRecentKernel } = useKernelPickerStore.getState();
    ['a', 'b', 'c', 'd', 'e', 'f'].forEach(n => addRecentKernel(n));
    expect(useKernelPickerStore.getState().recentKernels).toHaveLength(5);
  });

  it('should keep the highest-count kernel when trimming to 5', () => {
    const { addRecentKernel } = useKernelPickerStore.getState();
    // Add 6 kernels; boost 'high_use' to count=3 so it survives trim
    ['a', 'b', 'c', 'd', 'e'].forEach(n => addRecentKernel(n));
    addRecentKernel('high_use');
    addRecentKernel('high_use');
    addRecentKernel('high_use');
    const { recentKernels } = useKernelPickerStore.getState();
    expect(recentKernels).toHaveLength(5);
    expect(recentKernels[0].name).toBe('high_use');
    expect(recentKernels[0].count).toBe(3);
  });
});
