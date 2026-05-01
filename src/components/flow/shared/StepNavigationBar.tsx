/**
 * StepNavigationBar
 * Floating step guide bar on canvas.
 * Shows: 1.Data Source > 2.Relations > 3.Operator > 4.Columns > 5.Conditions > 6.Execute
 */

import React from 'react';

interface Step {
  num: number;
  text: string;
}

const STEPS: Step[] = [
  { num: 1, text: '选择数据源' },
  { num: 2, text: '创建关系' },
  { num: 3, text: '选择算子' },
  { num: 4, text: '选择列' },
  { num: 5, text: '构建条件' },
  { num: 6, text: '执行' },
];

export const StepNavigationBar: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        fontSize: '12px',
        fontWeight: 500,
        background: 'var(--vm-flow-node-bg)',
        border: '1px solid var(--vm-border-mid)',
        borderRadius: '10px',
        padding: '8px 16px',
        boxShadow: 'var(--vm-flow-shadow-control)',
        zIndex: 10,
        backdropFilter: 'blur(12px)',
      }}
    >
      {STEPS.map((step, index) => (
        <React.Fragment key={step.num}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '6px',
              background: 'transparent',
              border: '1px solid transparent',
              transition: 'all 0.2s ease',
            }}
          >
            {/* Step number circle */}
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--vm-primary) 0%, var(--vm-primary-hover) 100%)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 'bold',
                color: '#fff',
                boxShadow: '0 0 12px var(--vm-primary-glow)',
              }}
            >
              {step.num}
            </div>
            <span
              style={{
                color: 'var(--vm-text-primary)',
                whiteSpace: 'nowrap',
              }}
            >
              {step.text}
            </span>
          </div>
          {/* Connector arrow */}
          {index < STEPS.length - 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0 4px',
                color: 'var(--vm-surface-lighter)',
                fontSize: '14px',
              }}
            >
              →
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default StepNavigationBar;
