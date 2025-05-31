module.exports = {
  env: {
    commonjs: true,
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'airbnb-base',
    'plugin:jest/recommended',
    'plugin:prettier/recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest'
  },
  rules: {
    'no-console': 'off', // ログ出力のため許可
    'no-unused-vars': ['error', { argsIgnorePattern: 'next|req|res' }],
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error',
    'prefer-arrow-callback': 'error',
    'arrow-body-style': ['error', 'as-needed'],
    'import/no-extraneous-dependencies': ['error', { devDependencies: ['**/*.test.js', '**/*.spec.js', 'jest.setup.js'] }],
    'jest/no-disabled-tests': 'warn',
    'jest/no-focused-tests': 'error',
    'jest/no-identical-title': 'error',
    'jest/prefer-to-have-length': 'warn',
    'jest/valid-expect': 'error',
    'consistent-return': 'off', // 非同期処理のため
    'no-use-before-define': ['error', { functions: false }],
    'no-restricted-syntax': 'off', // for...of許可
    'no-await-in-loop': 'off', // ループ内のawait許可
    'global-require': 'off', // 動的require許可
    'class-methods-use-this': 'off', // クラスメソッドでthis不要許可
    'max-classes-per-file': 'off' // 複数クラス許可
  }
};