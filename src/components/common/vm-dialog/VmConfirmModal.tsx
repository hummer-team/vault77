/**
 * VmConfirmModal.tsx
 * Centered confirm dialog using CSS variables for theme adaptation.
 */
import React, { useEffect, useState } from 'react';
import { ConfirmItem, removeConfirm } from '../../../utils/vmDialogStore';

// --- SVG Icons ---

const WarningModalIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="14" fill="var(--vm-warning-color)" fillOpacity="0.15" />
    <path d="M14 9v7" stroke="var(--vm-warning-color)" strokeWidth="2" strokeLinecap="round" />
    <circle cx="14" cy="19.5" r="1.2" fill="var(--vm-warning-color)" />
  </svg>
);

const ErrorModalIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="14" fill="var(--vm-error-color)" fillOpacity="0.15" />
    <path d="M9.5 9.5l9 9M18.5 9.5l-9 9" stroke="var(--vm-error-color)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const InfoModalIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="14" fill="var(--vm-flow-info)" fillOpacity="0.15" />
    <circle cx="14" cy="9" r="1.2" fill="var(--vm-flow-info)" />
    <path d="M14 13v7" stroke="var(--vm-flow-info)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const MODAL_ICONS = {
  warning: <WarningModalIcon />,
  error: <ErrorModalIcon />,
  info: <InfoModalIcon />,
};

const OK_BUTTON_COLORS = {
  warning: 'var(--vm-warning-color)',
  error: 'var(--vm-error-color)',
  info: 'var(--vm-primary)',
};

interface VmConfirmModalProps {
  item: ConfirmItem;
}

export const VmConfirmModal: React.FC<VmConfirmModalProps> = ({ item }) => {
  const [visible, setVisible] = useState(false);
  const type = item.type ?? 'warning';

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const close = (cb: () => void) => {
    setVisible(false);
    setTimeout(() => {
      removeConfirm(item.id);
      cb();
    }, 220);
  };

  const handleOk = () => close(item.onOk);
  const handleCancel = () => close(item.onCancel);

  const okColor = OK_BUTTON_COLORS[type];

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(3px)',
          zIndex: 9998,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.22s ease',
        }}
        onClick={handleCancel}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`vm-confirm-title-${item.id}`}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: visible
            ? 'translate(-50%, -50%) scale(1)'
            : 'translate(-50%, -50%) scale(0.92)',
          zIndex: 9999,
          width: 360,
          background: 'var(--vm-bg-card)',
          border: '1px solid var(--vm-border-mid)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.25)',
          backdropFilter: 'blur(16px)',
          padding: '28px 28px 24px',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.34,1.56,0.64,1)',
          pointerEvents: 'all',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon + Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          <span style={{ flexShrink: 0, marginTop: 2 }}>{MODAL_ICONS[type]}</span>
          <h3
            id={`vm-confirm-title-${item.id}`}
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              lineHeight: '22px',
              color: 'var(--vm-text-primary)',
            }}
          >
            {item.title}
          </h3>
        </div>

        {/* Content */}
        {item.content && (
          <p
            style={{
              margin: '0 0 24px 42px',
              fontSize: 13,
              lineHeight: '20px',
              color: 'var(--vm-text-secondary)',
            }}
          >
            {item.content}
          </p>
        )}
        {!item.content && <div style={{ height: 8 }} />}

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '7px 18px',
              borderRadius: 7,
              border: '1px solid var(--vm-border-mid)',
              background: 'var(--vm-surface-light)',
              color: 'var(--vm-text-secondary)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--vm-surface-hover)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--vm-text-primary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--vm-surface-light)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--vm-text-secondary)';
            }}
          >
            {item.cancelText ?? 'Cancel'}
          </button>

          <button
            onClick={handleOk}
            style={{
              padding: '7px 18px',
              borderRadius: 7,
              border: 'none',
              background: okColor,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
          >
            {item.okText ?? 'Confirm'}
          </button>
        </div>
      </div>
    </>
  );
};
