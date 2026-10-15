import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

const recommended = jsxA11y.flatConfigs.recommended;

// Accessibility checks for the screens. Run with:  npm run lint:a11y
export default [
  { ignores: ["dist", "node_modules"] },
  {
    ...recommended,
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ...recommended.languageOptions,
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...recommended.rules,
      // Dialogs and the order screen focus their first field on purpose
      "jsx-a11y/no-autofocus": "off",
    },
  },
];
