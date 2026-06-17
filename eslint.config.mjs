/** @type {import("eslint").Linter.Config[]} */
const config = [
  { ignores: ["out/**", ".next/**", "node_modules/**"] },
  {
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
    },
  },
];

export default config;
