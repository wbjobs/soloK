import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import electron from "vite-plugin-electron";
import electronRenderer from "vite-plugin-electron-renderer";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';
import { resolve } from 'path';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    sourcemap: 'hidden',
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
      },
    },
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['@julusian/midi', '@nut-tree/nut-js'],
            },
          },
        },
      },
      {
        entry: 'src/main/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    electronRenderer(),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }), 
    tsconfigPaths()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
})
