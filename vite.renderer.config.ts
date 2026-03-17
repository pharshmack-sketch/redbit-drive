import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "./",
  root: "src/renderer",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    // Встраиваем маленькие ассеты (< 10kb) в base64, крупные копируем как файлы
    assetsInlineLimit: 10240,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
      // Позволяет импортировать из assets/ через @assets/
      "@assets": path.resolve(__dirname, "assets"),
    },
  },
  // Явно разрешаем импорт PNG из директории assets (вне src/renderer)
  assetsInclude: ["**/*.png", "**/*.icns", "**/*.ico", "**/*.svg"],
  server: {
    port: 5173,
    fs: {
      // Разрешить Vite dev server обслуживать файлы из assets/
      allow: [
        path.resolve(__dirname, "src/renderer"),
        path.resolve(__dirname, "assets"),
      ],
    },
  },
});
