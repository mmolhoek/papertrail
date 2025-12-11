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
    rules: {
      // Enforce path alias usage - disallow deep relative imports
      // Allows: "./" and "../" for sibling/parent within same module
      // Disallows: "../../" and deeper to force path alias usage
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/../../*"],
              message:
                "Use path aliases (@core/*, @services/*, @di/*, @web/*, @utils/*, @errors/*) instead of deep relative imports.",
            },
          ],
        },
      ],
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
