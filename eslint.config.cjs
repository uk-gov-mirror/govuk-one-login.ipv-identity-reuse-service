const { defineConfig } = require("eslint/config");

const globals = require("globals");
const tsParser = require("@typescript-eslint/parser");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const jest = require("eslint-plugin-jest");
const js = require("@eslint/js");

const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

module.exports = defineConfig([
  {
    ignores: [".aws-sam/**", "eslint.config.cjs"],

    languageOptions: {
      globals: {
        ...globals.node,
      },

      parser: tsParser,
    },

    plugins: {
      "@typescript-eslint": typescriptEslint,
    },

    extends: compat.extends(
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended",
      "plugin:prettier/recommended"
    ),

    rules: {
      "@typescript-eslint/no-var-requires": 0,
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": 2,

      "@typescript-eslint/explicit-module-boundary-types": [
        "warn",
        {
          allowArgumentsExplicitlyTypedAsAny: true,
        },
      ],

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          caughtErrorsIgnorePattern: "^ignore",
          varsIgnorePattern: "_",
        },
      ],

      "padding-line-between-statements": [
        "error",
        {
          blankLine: "any",
          prev: "*",
          next: "*",
        },
      ],
    },
  },
  {
    files: ["tests/**/*.test.ts"],

    plugins: {
      jest,
    },

    extends: compat.extends("plugin:jest/recommended", "plugin:jest/style"),

    rules: {
      "jest/consistent-test-it": [
        "error",
        {
          fn: "it",
        },
      ],

      "jest/prefer-hooks-in-order": ["error"],
      "jest/prefer-hooks-on-top": ["error"],

      "jest/prefer-lowercase-title": [
        "error",
        {
          ignore: ["describe"],
        },
      ],

      "jest/prefer-strict-equal": ["error"],
    },
  },
]);
