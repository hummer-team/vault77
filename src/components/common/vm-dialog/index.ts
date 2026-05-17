/**
 * vm-dialog/index.ts
 * Public API: vmMessage and vmConfirm utility functions.
 *
 * Usage:
 *   vmMessage.success('Saved!')
 *   vmMessage.error('Something went wrong')
 *   const dismiss = vmMessage.loading('Processing...') → call dismiss() to hide
 *   vmConfirm({ title: 'Delete?', onOk: () => ... })
 */
import { addNotification, addConfirm } from './vmDialogStore';

export { VmDialogHost } from './VmDialogHost';

// --- Durations (ms) ---
const DURATION_SUCCESS = 2200;
const DURATION_INFO = 2500;
const DURATION_WARNING = 3500;
const DURATION_ERROR = 4500;

export interface VmConfirmOptions {
  title: string;
  content?: string;
  okText?: string;
  cancelText?: string;
  type?: 'warning' | 'error' | 'info';
  onOk?: () => void;
  onCancel?: () => void;
}

export const vmMessage = {
  success: (content: string): void => {
    addNotification({ type: 'success', content, duration: DURATION_SUCCESS });
  },
  info: (content: string): void => {
    addNotification({ type: 'info', content, duration: DURATION_INFO });
  },
  warning: (content: string): void => {
    addNotification({ type: 'warning', content, duration: DURATION_WARNING });
  },
  error: (content: string): void => {
    addNotification({ type: 'error', content, duration: DURATION_ERROR });
  },
  /**
   * Loading notification. Returns a dismiss function (same API as antd message.loading).
   * @param content - Message text
   * @param duration - ms, 0 = manual dismiss only (default: 0)
   */
  loading: (content: string, duration = 0): (() => void) => {
    return addNotification({ type: 'loading', content, duration });
  },
} as const;

/**
 * Show a centered confirm dialog. Returns a Promise resolving to true (OK) or false (Cancel).
 */
export function vmConfirm(options: VmConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    addConfirm({
      title: options.title,
      content: options.content,
      okText: options.okText,
      cancelText: options.cancelText,
      type: options.type ?? 'warning',
      onOk: () => {
        options.onOk?.();
        resolve(true);
      },
      onCancel: () => {
        options.onCancel?.();
        resolve(false);
      },
    });
  });
}
