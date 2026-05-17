/**
 * vmDialog.ts — Public API for the vm-dialog notification and confirm system.
 *
 * Usage (from any .ts/.tsx file):
 *   import { vmMessage, vmConfirm } from '../../utils/vmDialog';
 *
 *   vmMessage.success('Saved!')
 *   vmMessage.error('Something went wrong')
 *   const dismiss = vmMessage.loading('Processing...') → dismiss() to hide
 *   vmConfirm({ title: 'Delete?', onOk: () => ... })
 */
import { addNotification, addConfirm } from './vmDialogStore';

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

/** Notification utility. Auto-dismiss durations: success 2.2s, info 2.5s, warning 3.5s, error 4.5s. */
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
   * Show a loading notification.
   * @returns Dismiss function — call it to hide the notification manually.
   * @param duration - ms, 0 = manual dismiss only (default: 0)
   */
  loading: (content: string, duration = 0): (() => void) => {
    return addNotification({ type: 'loading', content, duration });
  },
} as const;

/**
 * Show a centered confirm dialog.
 * @returns Promise resolving to true (OK) or false (Cancel).
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
