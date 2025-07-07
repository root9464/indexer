import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.VITE_DEV_HOST === 'true' || true,
    port: parseInt(process.env.VITE_DEV_PORT) || 3000,
    allowedHosts: process.env.VITE_ALLOWED_HOSTS 
      ? process.env.VITE_ALLOWED_HOSTS.split(',')
      : ['durov.online', 'localhost', '2c25-85-159-228-25.ngrok-free.app'],
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.BFF_PORT || 5000}`,
        changeOrigin: true,
        secure: false,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data, X-Telegram-Username, X-Telegram-User-ID'
        }
      }
    }
  },
  build: {
    outDir: process.env.VITE_BUILD_OUTDIR || 'dist',
    assetsDir: process.env.VITE_BUILD_ASSETSDIR || 'assets',
    sourcemap: process.env.VITE_BUILD_SOURCEMAP === 'true' || false,
    chunkSizeWarningLimit: parseInt(process.env.VITE_CHUNK_SIZE_WARNING_LIMIT) || 500,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
          router: ['react-router-dom']
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    minify: process.env.VITE_BUILD_MINIFY === 'false' ? false : true,
    target: process.env.VITE_BUILD_TARGET || 'es2015'
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || '/api'),
    'process.env.REACT_APP_API_BASE_URL': JSON.stringify(process.env.VITE_API_URL || '/api')
  },
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
    exclude: []
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'recharts'],
    exclude: []
  }
})
