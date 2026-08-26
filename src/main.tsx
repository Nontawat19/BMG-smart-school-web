import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // ← ✅ ต้องมี


import { Provider } from 'react-redux';
import { store } from './store'; // ✅ คงไว้แค่บรรทัดเดียว
import { listenToAuthChanges } from './store/slices/authSlice';
import { ThemeProvider } from './ThemeContext';
import { SidebarProvider } from './SidebarContext';

if (typeof console !== 'undefined') {
  const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const bodyTextColor = prefersDark ? '#ffffff' : '#000000';
  console.log('%cหยุด!', 'color:#ef4444; font-size:72px; font-weight:900; text-shadow: 2px 2px 0 rgba(0,0,0,0.3);');
  console.log(
    '%cฟีเจอร์นี้เป็นฟีเจอร์ของเบราว์เซอร์ที่มีจุดมุ่งหมายให้ใช้สำหรับนักพัฒนา หากมีใครบอกให้คุณคัดลอกและวางข้อความบางอย่างที่นี่เพื่อเปิดใช้งานฟีเจอร์บางอย่างของระบบ BMG SmartSchool หรือเพื่อ "แฮ็ก" บัญชีของผู้อื่น คำบอกกล่าวเช่นนี้เป็นการหลอกลวงและจะทำให้ผู้นั้นมีสิทธิ์เข้าถึงบัญชี BMG SmartSchool ของคุณ',
    `color:${bodyTextColor}; font-size:18px;`
  );
  console.log(
    '%cห้ามวางโค้ดหรือข้อความใด ๆ ที่คุณไม่เข้าใจความหมายลงในคอนโซลนี้โดยเด็ดขาด',
    'color:#ef4444; font-size:16px; font-weight:700;'
  );
}

store.dispatch(listenToAuthChanges());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        <SidebarProvider>
          <App />
        </SidebarProvider>
      </ThemeProvider>
    </Provider>
  </React.StrictMode>,
);
