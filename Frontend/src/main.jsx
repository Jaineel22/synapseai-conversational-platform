import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The app only uses the "fa-solid" style, so only that subset is loaded
// (fontawesome.min.css provides the shared base rules solid.min.css needs).
import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import '@fortawesome/fontawesome-free/css/solid.min.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
