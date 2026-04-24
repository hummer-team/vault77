import React, { createContext, useContext, useLayoutEffect, useState } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import type { ThemeDef } from './types';
import { orangeDarkTheme } from './themes/orangeDark';
import { cyanDarkTheme } from './themes/cyanDark';

// Registry of available themes
export const THEMES: Record<string, ThemeDef> = {
  'orange-dark': orangeDarkTheme,
  'cyan-dark': cyanDarkTheme,
};

export const DEFAULT_THEME = orangeDarkTheme;

interface ThemeContextValue {
  currentTheme: ThemeDef;
  setTheme: (name: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  currentTheme: DEFAULT_THEME,
  setTheme: () => {},
});

interface ThemeProviderProps {
  defaultThemeName?: string;
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  defaultThemeName = 'orange-dark',
  children,
}) => {
  const [currentTheme, setCurrentThemeState] = useState<ThemeDef>(
    THEMES[defaultThemeName] ?? DEFAULT_THEME,
  );

  // Inject CSS variables before first paint to avoid flash
  useLayoutEffect(() => {
    const root = document.documentElement;
    const entries = Object.entries(currentTheme.cssVars) as [string, string][];
    entries.forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    // Update color-scheme for browser integration
    root.style.colorScheme = currentTheme.algorithm;
  }, [currentTheme]);

  const setTheme = (name: string) => {
    const next = THEMES[name];
    if (next) setCurrentThemeState(next);
  };

  const antdAlgorithm = currentTheme.algorithm === 'dark'
    ? antdTheme.darkAlgorithm
    : antdTheme.defaultAlgorithm;

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme }}>
      <ConfigProvider
        theme={{
          algorithm: antdAlgorithm,
          token: currentTheme.antdTokens,
          components: {
            Button: {
              colorPrimary: currentTheme.antdTokens.colorPrimary,
              algorithm: true,
            },
            Input: { borderRadius: 8 },
            Card: { borderRadiusLG: 12 },
            Table: { borderRadius: 8 },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);

// Re-exports for convenience
export { TOKEN } from './tokens';
export type { ThemeDef } from './types';
export { orangeDarkTheme } from './themes/orangeDark';
