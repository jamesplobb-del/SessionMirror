import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
 plugins: [react(),tailwindcss()],
 define: {__APP_VERSION__:JSON.stringify('2.3.0-cloud-review'),'import.meta.env.VITE_SENTRY_DSN':JSON.stringify('')},
 server: {host:'127.0.0.1',port:5195,strictPort:true},
 build: {outDir:'/private/tmp/besttake-cloud-review-build',emptyOutDir:true,rollupOptions:{input:{comparison:'scripts/fixtures/cloud-games/index.html',frame:'scripts/fixtures/cloud-games/frame.html'}}},
})
