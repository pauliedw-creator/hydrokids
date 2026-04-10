import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import HydroKids from './HydroKids.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HydroKids />
  </StrictMode>
)