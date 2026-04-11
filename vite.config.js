import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'The Daily Drink',
short_name: 'Daily Drink',
        description: 'Keep your pet happy - stay hydrated!',
        theme_color: '#16213e',
        background_color: '#16213e',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/hydrokids/',
        scope: '/hydrokids/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ],
  base: '/hydrokids/',
})
