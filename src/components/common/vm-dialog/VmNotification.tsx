/**
 * VmNotification.tsx
 * Individual notification card using CSS variables for theme adaptation.
 */
import React, { useEffect, useState } from 'react';
import { NotificationItem, NotificationType, removeNotification } from './vmDialogStore';

// --- SVG Icons ---

const SuccessIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="10" fill="var(--vm-success-color)" fillOpacity="0.15" />
    <path d="M6 10.5l3 3 5-6" stroke="var(--vm-success-color)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const InfoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="10" fill="var(--vm-flow-info)" fillOpacity="0.15" />
    <circle cx="10" cy="6.5" r="1" fill="var(--vm-flow-info)" />
    <path d="M10 9.5v5" stroke="var(--vm-flow-info)" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const WarningIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="10" fill="var(--vm-warning-color)" fillOpacity="0.15" />
    <path d="M10 6v5" stroke="var(--vm-warning-color)" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="10" cy="13.5" r="1" fill="var(--vm-warning-color)" />
  </svg>
);

const ErrorIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="10" fill="var(--vm-error-color)" fillOpacity="0.15" />
    <path d="M7 7l6 6M13 7l-6 6" stroke="var(--vm-error-color)" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const LoadingIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ animation: 'vm-spin 0.9s linear infinite' }}>
    <circle cx="10" cy="10" r="8" stroke="var(--vm-primary)" strokeOpacity="0.2" strokeWidth="2" />
    <path d="M10 2a8 8 0 018 8" stroke="var(--vm-primary)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const ICONS: Record<NotificationType, React.ReactNode> = {
  success: <SuccessIcon />,
  info: <InfoIcon />,
  warning: <WarningIcon />,
  error: <ErrorIcon />,
  loading: <LoadingIcon />,
};

const BORDER_COLORS: Record<NotificationType, string> = {
  success: 'var(--vm-success-color)',
  info: 'var(--vm-flow-info)',
  warning: 'var(--vm-warning-color)',
  error: 'var(--vm-error-color)',
  loading: 'var(--vm-primary)',
};

interface VmNotificationProps {
  item: NotificationItem;
}

export const VmNotification: React.FC<VmNotificationProps> = ({ item }) => {
  const [visible, setVisible] = useState(false);

  // Fade-in on mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => removeNotification(item.id), 220);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 16px',
        background: 'var(--vm-bg-card)',
        border: `1px solid ${BORDER_COLORS[item.type]}`,
        borderLeft: `3px solid ${BORDER_COLORS[item.type]}`,
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.18)',
        backdropFilter: 'blur(12px)',
        minWidth: 280,
        maxWidth: 380,
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(8px)',
        transition: 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        pointerEvents: 'all',
        cursor: 'default',
      }}
    >
      {/* Icon */}
      <span style={{ flexShrink: 0, marginTop: 1 }}>{ICONS[item.type]}</span>

      {/* Content */}
      <span
        style={{
          flex: 1,
          fontSize: 13,
          lineHeight: '20px',
          color: 'var(--vm-text-primary)',
          wordBreak: 'break-word',
        }}
      >
        {item.content}
      </span>

      {/* Close button (not shown for loading) */}
      {item.type !== 'loading' && (
        <button
          onClick={handleClose}
          style={{
            flexShrink: 0,
            background: 'none',
            border: 'none',
            padding: '2px 2px',
            cursor: 'pointer',
            color: 'var(--vm-text-muted)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.15s',
            marginTop: 2,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--vm-text-primary)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--vm-text-muted)'; }}
          aria-label="Close notification"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
};
