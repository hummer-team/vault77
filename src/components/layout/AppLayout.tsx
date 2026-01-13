import React, { useState, useRef, useEffect } from 'react';
import {
  HistoryOutlined,
  PieChartOutlined,
  DatabaseOutlined,
  UserOutlined,
  SettingOutlined,
  CrownOutlined,
  DownOutlined,
  MessageOutlined,
  CloseOutlined, // Added CloseOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Layout, Menu, Typography, Space, FloatButton, Popover, Avatar, Button } from 'antd'; // Added Button

const { Content, Sider } = Layout;
const { Title } = Typography;

type MenuItem = Required<MenuProps>['items'][number];

function getItem(
  label: React.ReactNode,
  key: React.Key,
  icon?: React.ReactNode,
  children?: MenuItem[],
): MenuItem {
  return { key, icon, children, label } as MenuItem;
}

const items: MenuItem[] = [
  getItem('Workbench', '1', <PieChartOutlined />),
  getItem('SessionHistory', '2', <HistoryOutlined />),
  getItem('TemplateList', '3', <DatabaseOutlined />),
  getItem('Subscription', '4', <CrownOutlined />),
  getItem('Feedback', 'feedback', <MessageOutlined />),
  getItem('Settings', '5', <SettingOutlined />),
];

interface AppLayoutProps {
  children: React.ReactNode;
  currentKey: string;
  onMenuClick: MenuProps['onClick'];
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, currentKey, onMenuClick }) => {
  const [collapsed, setCollapsed] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const userMenuContent = (
    <div>
      <a href="#">退出</a>
    </div>
  );

  const handleScrollToBottom = () => {
    const content = contentRef.current;
    if (content) {
      content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' });
    }
  };

  // Function to handle closing the sidebar
  const handleCloseSidebar = () => {
    console.log('Sending CLOSE_SIDEBAR message from AppLayout.');
    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'CLOSE_SIDEBAR' });
    } else {
      console.warn('chrome.runtime.sendMessage is not available. Are you in a browser context?');
    }
  };

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = content;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
      setShowScrollToBottom(!isAtBottom);
    };

    content.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => content.removeEventListener('scroll', handleScroll);
  }, [children]);

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)} style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div 
            style={{ 
              height: 32, 
              margin: 16, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '8px',
              cursor: 'pointer'
            }}
            onClick={() => setCollapsed(!collapsed)}
          >
             <img 
               src="/icons/icon-16.png" 
               alt="Vaultmind Logo" 
               style={{ height: '100%', width: 'auto' }} 
             />
             <Title 
               level={4} 
               style={{ 
                 color: 'white', 
                 margin: 0,
                 opacity: collapsed ? 0 : 1,
                 width: collapsed ? 0 : 'auto',
                 overflow: 'hidden',
                 whiteSpace: 'nowrap',
                 transition: 'width 0.2s ease-in-out, opacity 0.2s ease-in-out',
               }}
             >
              Vaultmind
             </Title>
          </div>
          <Menu 
            theme="dark" 
            selectedKeys={[currentKey]} 
            mode="inline" 
            items={items} 
            onClick={onMenuClick} 
            style={{ flex: 1, minHeight: 0 }}
          />
        </div>
        <div style={{ padding: '16px', flexShrink: 0 }}>
          <Popover content={userMenuContent} placement="rightBottom" trigger="click">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} />
              {!collapsed && <Typography.Text>hi, admin</Typography.Text>}
            </Space>
          </Popover>
        </div>
      </Sider>
      <Layout style={{ 
        display: 'flex', 
        flexDirection: 'column',
        background: `radial-gradient(circle at top, #2a2a2e, #1e1e20)`
      }}>
        {/* Added header for close button */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          padding: '8px 16px 0 0', // Adjust padding as needed
          flexShrink: 0 
        }}>
          <Button 
            type="text" 
            icon={<CloseOutlined style={{ color: 'white' }} />} 
            onClick={handleCloseSidebar} 
            style={{ color: 'white' }}
          />
        </div>
        <Content ref={contentRef} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', margin: '0 16px 16px 16px' }}> {/* Adjusted margin */}
          {children}
        </Content>
      </Layout>
      <FloatButton 
        icon={<DownOutlined />}
        onClick={handleScrollToBottom}
        style={{
          display: showScrollToBottom ? 'block' : 'none',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 40,
        }}
      />
    </Layout>
  );
};

export default AppLayout;
