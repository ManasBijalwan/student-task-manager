import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
    registrations.filter((registration) => [registration.active, registration.waiting, registration.installing]
      .some((worker) => worker?.scriptURL === new URL('/sw.js', window.location.origin).href))
      .map(async (registration) => {
        const subscription = await registration.pushManager?.getSubscription();
        await subscription?.unsubscribe();
        await registration.unregister();
      })
  )).catch(() => {});
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
