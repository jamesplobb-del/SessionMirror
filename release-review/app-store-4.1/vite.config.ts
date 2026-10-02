import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({plugins:[react(),tailwindcss()],define:{__APP_VERSION__:JSON.stringify('4.1'),'import.meta.env.VITE_FAKE_MEDIA':JSON.stringify('1'),'import.meta.env.VITE_SENTRY_DSN':JSON.stringify('')},server:{host:'127.0.0.1',port:5226,strictPort:true,hmr:false}})
