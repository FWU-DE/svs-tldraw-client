/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig, PluginOption } from "vite";

const noncePlugin = (placeholderName = "**CSP_NONCE**"): PluginOption => ({
  name: "add-nonce-script-attr",
  enforce: "post",
  transformIndexHtml(html) {
    return html
      .replace(new RegExp("<script", "g"), `<script nonce="${placeholderName}"`)
      .replace(new RegExp("<link", "g"), `<link nonce="${placeholderName}"`);
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    target: "es2022",
  },
  plugins: [react(), noncePlugin()],
  server: {
    port: 3046,
    proxy: {
      "/api/v3/file": {
        target: "http://localhost:4444",
        changeOrigin: true,
        secure: false,
      },
      "/api/v1": {
        target: "http://localhost:3030",
        changeOrigin: true,
        secure: false,
      },
      "/api/v3": {
        target: "http://localhost:3030",
        changeOrigin: true,
        secure: false,
      },
      "/api/tldraw": {
        target: "http://localhost:3349",
        changeOrigin: true,
        secure: false,
      },
      "/tldraw-server": {
        target: "ws://localhost:3345",
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/vitest.setup.ts"],
    // The BBB packages import eventemitter3 in a way only a bundler resolves;
    // let Vitest transform them like Vite does.
    server: { deps: { inline: [/@bigbluebutton/] } },
  },
  preview: {
    port: 3046,
  },
});
