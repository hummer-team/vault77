/**
 * vmDialogStore.ts
 * Singleton pub-sub store for notifications and confirm dialogs.
 * Allows calling vmMessage / vmConfirm from any TS/TSX file without hooks.
 */

export type NotificationType = 'success' | 'info' | 'warning' | 'error' | 'loading';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  content: string;
  /** Auto-dismiss duration in ms. 0 = manual close only. */
  duration: number;
}

export interface ConfirmItem {
  id: string;
  title: string;
  content?: string;
  okText?: string;
  cancelText?: string;
  type?: 'warning' | 'error' | 'info';
  onOk: () => void;
  onCancel: () => void;
}

export interface StoreState {
  notifications: NotificationItem[];
  confirms: ConfirmItem[];
}

let state: StoreState = { notifications: [], confirms: [] };
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): Readonly<StoreState> {
  return state;
}

// --- Notification API ---

export function addNotification(item: Omit<NotificationItem, 'id'>): () => void {
  const id = Math.random().toString(36).slice(2, 10);
  state = { ...state, notifications: [...state.notifications, { ...item, id }] };
  notifyListeners();

  const dismiss = () => removeNotification(id);
  if (item.duration > 0) {
    setTimeout(dismiss, item.duration);
  }
  return dismiss;
}

export function removeNotification(id: string): void {
  state = { ...state, notifications: state.notifications.filter((n) => n.id !== id) };
  notifyListeners();
}

// --- Confirm API ---

export function addConfirm(item: Omit<ConfirmItem, 'id'>): void {
  const id = Math.random().toString(36).slice(2, 10);
  state = { ...state, confirms: [...state.confirms, { ...item, id }] };
  notifyListeners();
}

export function removeConfirm(id: string): void {
  state = { ...state, confirms: state.confirms.filter((c) => c.id !== id) };
  notifyListeners();
}
