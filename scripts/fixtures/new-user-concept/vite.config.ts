import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Other tasks may be building/syncing the app. Keep this review stable while
// they write native files or copy public assets. Reload manually after edits.
export default defineConfig({
  plugins:[react(),tailwindcss()],
  server:{host:'127.0.0.1',port:5201,strictPort:true,hmr:false,watch:null},
  define:{__APP_VERSION__:JSON.stringify('concept')},
})
