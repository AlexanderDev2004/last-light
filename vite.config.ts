import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  optimizeDeps: {
    // P2P signaling clients must be pre-bundled consistently, otherwise the
    // dev server serves them with "504 Outdated Optimize Dep" after HMR
    // picks up a newly added strategy package.
    include: ['@trystero-p2p/torrent', '@trystero-p2p/nostr'],
  },
})

export default config
