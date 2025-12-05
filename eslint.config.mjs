import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  // Global ignores
  {
    ignores: ["dist/", "node_modules/", "*.config.mjs"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Backend TypeScript (Node.js)
  {
    files: ["src/**/*.{ts,mts,cts}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Frontend JavaScript (Browser)
  {
    files: ["src/web/public/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        io: "readonly", // Socket.io client global
      },
    },
  },
];
