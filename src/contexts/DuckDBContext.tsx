/**
 * DuckDB Context
 * Provides shared DuckDB executeQuery method across the application
 */

import React, { createContext, useContext, ReactNode } from 'react';

export interface DuckDBContextValue {
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>;
  isDBReady: boolean;
  refreshKey: number;
}

const DuckDBContext = createContext<DuckDBContextValue | null>(null);

export interface DuckDBProviderProps {
  children: ReactNode;
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>;
  isDBReady: boolean;
  refreshKey?: number;
}

export const DuckDBProvider: React.FC<DuckDBProviderProps> = ({ children, executeQuery, isDBReady, refreshKey = 0 }) => {
  return (
    <DuckDBContext.Provider value={{ executeQuery, isDBReady, refreshKey }}>
      {children}
    </DuckDBContext.Provider>
  );
};

export const useDuckDBContext = (): DuckDBContextValue => {
  const context = useContext(DuckDBContext);
  if (!context) {
    throw new Error('useDuckDBContext must be used within DuckDBProvider');
  }
  return context;
};
