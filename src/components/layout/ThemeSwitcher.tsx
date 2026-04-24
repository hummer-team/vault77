import React from 'react';
import { Tooltip } from 'antd';
import { useTheme, THEMES } from '../../theme';

interface ThemeSwitcherProps {
  collapsed: boolean;
}

const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ collapsed }) => {
  const { currentTheme, setTheme } = useTheme();

  const themeList = Object.values(THEMES);

  return (
    <div
      style={{
        padding: collapsed ? '8px 0' : '8px 16px',
        display: 'flex',
        flexDirection: collapsed ? 'column' : 'row',
        gap: 8,
        justifyContent: collapsed ? 'center' : 'flex-start',
        alignItems: 'center',
        transition: 'all 0.2s ease',
      }}
    >
      {themeList.map((themeDef) => {
        const isActive = currentTheme.name === themeDef.name;
        const primaryColor = themeDef.cssVars['--vm-primary'];
        return (
          <Tooltip
            key={themeDef.name}
            title={themeDef.displayName}
            placement="right"
          >
            <div
              onClick={() => setTheme(themeDef.name)}
              style={{
                width: isActive ? 20 : 14,
                height: isActive ? 20 : 14,
                borderRadius: '50%',
                backgroundColor: primaryColor,
                cursor: 'pointer',
                border: isActive
                  ? '2px solid rgba(255, 255, 255, 0.85)'
                  : '2px solid rgba(255, 255, 255, 0.2)',
                transition: 'all 0.25s ease',
                boxShadow: isActive
                  ? `0 0 10px ${primaryColor}, 0 0 20px ${primaryColor}40`
                  : 'none',
                flexShrink: 0,
              }}
            />
          </Tooltip>
        );
      })}
    </div>
  );
};

export default ThemeSwitcher;
