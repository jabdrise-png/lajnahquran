import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

const originalConsoleError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && (args[0].includes('Refresh Token') || args[0].includes('refresh token'))) return;
  if (args[0] && args[0].message && (args[0].message.includes('Refresh Token') || args[0].message.includes('refresh token'))) return;
  originalConsoleError(...args);
};

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message && event.reason.message.includes('Refresh Token')) {
    event.preventDefault(); // Suppress the error
    localStorage.clear(); // Clear bad tokens
    window.location.reload(); // Reload cleanly
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

