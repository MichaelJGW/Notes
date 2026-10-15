import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import AuthGate from './components/AuthGate.jsx';
import { installRipple } from './ripple.js';

installRipple();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>
);
