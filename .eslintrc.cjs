// @ts-check

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
  ],
  plugins: ["simple-import-sort"],
  ignorePatterns: ["/lib/**/*"],
  rules: {
    "import/no-unresolved": "off",
    "no-prototype-builtins": "off",
    "simple-import-sort/imports": "error",
    "simple-import-sort/exports": "error",
  },
  overrides: [
    {
      files: [
        "functions/**/*.ts",
        "functions/**/*.tsx",
        "hosting/**/*.ts",
        "hosting/**/*.tsx",
      ],
      parser: "@typescript-eslint/parser",
      extends: [
        "plugin:import/typescript",
        "plugin:@typescript-eslint/recommended",
      ],
      plugins: ["@typescript-eslint", "import"],
      parserOptions: {
        project: ["functions/tsconfig.json", "hosting/tsconfig.json"],
        sourceType: "module",
      },
      rules: {
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { prefer: "type-imports" },
        ],
      },
    },
    {
      files: ["hosting/**/*.ts", "hosting/**/*.tsx"],
      rules: {},
    },
    {
      files: ["functions/**/*.ts", "functions/**/*.tsx"],
      rules: {},
    },
  ],
};
