import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider, theme, MenuProps } from 'antd';
import AppLayout from './components/layout/AppLayout';
import Workbench from './pages/workbench';
import SubscriptionPage from './pages/subscription/SubscriptionPage';
import 'antd/dist/reset.css';
import SettingsPage from "./pages/workbench/Settings.tsx";
import SessionListPage   from "./pages/session/SessionListPage.tsx";
import TemplateListPage from "./pages/asset-center/TemplateListPage.tsx";
import FeedbackDrawer from './pages/feedback/FeedbackDrawer.tsx';

const App = () => {
  const [currentPage, setCurrentPage] = useState('1');
  const [isFeedbackDrawerOpen, setIsFeedbackDrawerOpen] = useState(false);

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    console.log('Menu clicked:', e.key);
    if (e.key === 'feedback') {
      setIsFeedbackDrawerOpen(true);
      return;
    }
    setCurrentPage(e.key);
  };

  const renderCurrentPage = () => {
    switch (currentPage) {
      case '1':
        return <Workbench />;
      case '2':
        return <SessionListPage />;
      case '3':
        return <TemplateListPage />;
      case '4':
        return <SubscriptionPage />;
      case '5':
        return <SettingsPage/>
      default:
        return <Workbench />;
    }
  };

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
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
  </React.StrictMode>,
);
