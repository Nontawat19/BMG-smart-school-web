import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // ← ✅ ต้องมี


import { Provider } from 'react-redux';
import { store } from './store'; // ✅ คงไว้แค่บรรทัดเดียว
import { listenToAuthChanges } from './store/slices/authSlice';
import { ThemeProvider } from './ThemeContext';
import { SidebarProvider } from './SidebarContext';

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
