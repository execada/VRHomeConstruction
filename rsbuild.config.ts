import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginSass(),
  ],
  source: {
    entry: { index: './src/main.tsx' },
  },
  html: {
    template: './public/index.html',
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    // Не открываем браузер автоматически — публичную/локальную ссылку печатает run.sh.
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
  output: {
    assetPrefix: '/',
    filenameHash: true,
    cssModules: {
      exportLocalsConvention: 'camelCase',
    },
    distPath: {
      js: 'assets',
      css: 'assets',
    },
  },
  tools: {
    rspack: (config) => {
      // iCloud: зависимости лежат в node_modules.nosync — не следим за ними в dev.
      config.watchOptions = { ...config.watchOptions, ignored: /node_modules(\.nosync)?/ };
      return config;
    },
  },
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience',
    },
  },
});