/**
 * VmDialogHost.tsx
 * Portal host for all vm-dialog notifications and confirms.
 * Must be mounted once inside <ThemeProvider> in main.tsx so CSS vars are active.
 */
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { getState, subscribe, StoreState } from './vmDialogStore';
import { VmNotification } from './VmNotification';
import { VmConfirmModal } from './VmConfirmModal';

// Spin animation injected once
const SPIN_STYLE = `
@keyframes vm-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`;

let styleInjected = false;
function injectSpinStyle(): void {
  if (styleInjected) return;
  const el = document.createElement('style');
  el.textContent = SPIN_STYLE;
  document.head.appendChild(el);
  styleInjected = true;
}

export const VmDialogHost: React.FC = () => {
  const [state, setState] = useState<StoreState>(getState());

  useEffect(() => {
    injectSpinStyle();
    const unsubscribe = subscribe(() => setState(getState()));
    return unsubscribe;
  }, []);

  const hasAnyConfirm = state.confirms.length > 0;

  return ReactDOM.createPortal(
    <>
      {/* Notification stack — centered horizontally, vertically at 45% */}
      {state.notifications.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: '45%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            pointerEvents: 'none',
          }}
        >
          {state.notifications.map((item) => (
            <VmNotification key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Confirm dialogs — only first one rendered (queue) */}
      {hasAnyConfirm && <VmConfirmModal item={state.confirms[0]} />}
    </>,
    document.body,
  );
};
