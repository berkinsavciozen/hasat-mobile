// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".test-build/*"],
    rules: {
      // @sentry/react-native is installed and resolved by Metro/TypeScript, but
      // eslint-plugin-import does not understand the package's RN export map.
      "import/no-unresolved": ["error", { ignore: ["^@sentry/react-native$"] }],
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
]);
