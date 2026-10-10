import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AdvancedModeProvider } from './lib/AdvancedModeContext.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdvancedModeProvider>
      <App />
    </AdvancedModeProvider>
  </StrictMode>,
);
