import React, { useState, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider, theme, MenuProps, Spin } from 'antd';
import AppLayout from './components/layout/AppLayout';
// import Workbench from './pages/workbench';
const Workbench = React.lazy(() => import('./pages/workbench')); // 懒加载 Workbench
import SubscriptionPage from './pages/subscription/SubscriptionPage';
import 'antd/dist/reset.css';
import './global.css';
import SessionListPage from "./pages/session/SessionListPage.tsx";
import TemplateListPage from "./pages/asset-center/TemplateListPage.tsx";
import FeedbackDrawer from './pages/feedback/FeedbackDrawer.tsx';
import ProfilePage from "./pages/settings/ProfilePage.tsx";
import { Agentation } from "agentation";

const App = () => {
  const [currentPage, setCurrentPage] = useState('1');
  const [isFeedbackDrawerOpen, setIsFeedbackDrawerOpen] = useState(false);

  // Make the function async to use await
  const handleMenuClick: MenuProps['onClick'] = async (e) => {
    console.log('Menu clicked:', e.key);
    if (e.key === 'feedback') {
      setIsFeedbackDrawerOpen(true);
      return;
    }
    if (e.key === 'fullscreen') {
      if (chrome.tabs && chrome.runtime) {
        try {
          // First, await the closing of the current side panel
          await chrome.runtime.sendMessage({ type: 'CLOSE_SIDEBAR' });
          // Then, open in a new tab
          chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
        } catch (error) {
          console.error("Error during fullscreen action:", error);
          // Fallback: still open the new tab even if closing fails
          chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
        }
      } else {
        console.warn('Chrome APIs not available for fullscreen action.');
      }
      return;
    }
    setCurrentPage(e.key);
  };

  const renderCurrentPage = () => {
    // Render all pages simultaneously to preserve state (especially Workbench's DuckDB Worker)
    // Use display: none to hide inactive pages instead of unmounting them
    return (
      <>
        {/* Workbench - always mounted to preserve DuckDB Worker and data */}
        <div style={{ display: (currentPage === 'Workbench' || currentPage === '1') ? 'contents' : 'none' }}>
          <Suspense
            fallback={
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spin tip="Loading Vaultmind..." />
              </div>
            }
          >
            <Workbench
              isFeedbackDrawerOpen={isFeedbackDrawerOpen}
              setIsFeedbackDrawerOpen={setIsFeedbackDrawerOpen}
              onNavigateToInsight={() => {
                // No longer used - insights are shown in sidebar
                console.log('[App] onNavigateToInsight called but using sidebar now');
              }}
              onDuckDBReady={() => {
                // No longer needed in main.tsx - DuckDB is managed within Workbench
              }}
            />
          </Suspense>
        </div>

        {/* Session History */}
        <div style={{ display: currentPage === 'SessionHistory' ? 'contents' : 'none' }}>
          <SessionListPage />
        </div>

        {/* Template List */}
        <div style={{ display: currentPage === 'TemplateList' ? 'contents' : 'none' }}>
          <TemplateListPage />
        </div>

        {/* Subscription */}
        <div style={{ display: currentPage === 'Subscription' ? 'contents' : 'none' }}>
          <SubscriptionPage />
        </div>

        {/* Settings */}
        <div style={{ display: currentPage === 'Settings' ? 'contents' : 'none' }}>
          <ProfilePage />
        </div>
      </>
    );
  };

  return (
    <ConfigProvider 
      theme={{ 
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#FF6B00',
          colorInfo: '#FF6B00',
          colorLink: '#FF6B00',
          colorSuccess: '#52c41a',
          colorWarning: '#faad14',
          colorError: '#ff4d4f',
          borderRadius: 12,
          fontSize: 14,
        },
        components: {
          Button: {
            colorPrimary: '#FF6B00',
            algorithm: true,
          },
          Input: {
            borderRadius: 8,
          },
          Card: {
            borderRadiusLG: 12,
          },
          Table: {
            borderRadius: 8,
          },
        },
      }}
    >
      <AntdApp style={{ height: '100%' }}>
        <AppLayout
          currentKey={currentPage}
          onMenuClick={handleMenuClick}
        >
          {renderCurrentPage()}
        </AppLayout>
        <FeedbackDrawer
          open={isFeedbackDrawerOpen}
          onClose={() => setIsFeedbackDrawerOpen(false)}
        />
      </AntdApp>
    </ConfigProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Agentation />
  </React.StrictMode>,
);
