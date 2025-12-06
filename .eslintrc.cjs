module.exports = {
  root: true,
  env: {
    node: true,
    es2023: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  extends: [
    'eslint:recommended',
    'plugin:import/recommended',
    'prettier'
  ],
  rules: {
    'no-console': 'off',
    'import/no-unresolved': 'off'
  }
};
