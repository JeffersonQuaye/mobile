export default [
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^(React|_.*)$",
        },
      ],
      "no-undef": "off",
      "no-console": "off",
      "semi": ["warn", "always"],
    },
  },
  {
    ignores: ["node_modules/**", ".expo/**", "dist/**", ".test-dist/**"],
  },
];
