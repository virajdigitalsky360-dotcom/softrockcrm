import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { supabaseConfigError } from '@/lib/supabase';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {supabaseConfigError ? (
        <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '80px auto' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Configuration error</h1>
          <p style={{ color: '#475569' }}>{supabaseConfigError}</p>
        </div>
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </StrictMode>
);
