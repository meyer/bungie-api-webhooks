// @ts-check

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ["@meyer"],
  parserOptions: {
    project: "./tsconfig.json",
  },
  env: {
    es6: true,
    node: true,
  },
};
