import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PanelEventos from './PanelEventos.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PanelEventos />
  </StrictMode>,
)
