import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Downgraded from "error" → "warn" because ~160 pre-existing
      // occurrences (mostly in supabase/functions/generate-monthly-report*)
      // were drowning out real lint issues. Track them as technical debt
      // to be cleaned up in a dedicated pass.
      "@typescript-eslint/no-explicit-any": "warn",
      // The `landscape:` variant compiles AFTER `md:` at equal specificity,
      // so it silently wins on every desktop monitor (which is landscape).
      // Banned outright. The selector is intentionally unscoped: StatCard
      // built its class string in a cn() call outside the className
      // attribute, so a className-scoped rule would miss the file that
      // carried the defect app-wide.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/(^|\\s)landscape:/]",
          message:
            "El variant `landscape:` se compila despues de `md:` y lo vence en cualquier monitor. Si alguna vez hace falta compactar en telefono horizontal, usa `max-md:landscape:`, que compila a una consulta que no puede aplicar a partir de 768px.",
        },
        {
          selector: "TemplateElement[value.raw=/(^|\\s)landscape:/]",
          message:
            "El variant `landscape:` se compila despues de `md:` y lo vence en cualquier monitor. Usa `max-md:landscape:`.",
        },
      ],
    },
  },
);
