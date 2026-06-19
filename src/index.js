import React from 'react';
import ReactDOM from 'react-dom/client';
import { Authenticator } from '@aws-amplify/ui-react';
import './index.css';
import App from './App';
import MemberDemo from './MemberDemo';
import reportWebVitals from './reportWebVitals';

// No-login member-app demo: open the app at "/#member-demo" to show the
// member experience on a phone in front of customers. Any other URL renders
// the normal owner app (Cognito login) exactly as before.
const isMemberDemo = window.location.hash.replace(/^#\/?/, '').startsWith('member-demo');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {isMemberDemo ? (
      <MemberDemo />
    ) : (
      <Authenticator.Provider>
        <App />
      </Authenticator.Provider>
    )}
  </React.StrictMode>
);

// Register the service worker so PulseRetain is installable to the home screen
// (full-screen, offline-capable). Network-first SW lives at /service-worker.js.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${process.env.PUBLIC_URL || ""}/service-worker.js`)
      .catch((err) => console.warn("Service worker registration failed:", err));
  });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
