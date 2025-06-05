module.exports = {
    env: {
        browser: false,
        es2021: true,
        node: true,
        jest: true
    },
    extends: [
        'eslint:recommended'
    ],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
    },
    rules: {
        // Code quality
        'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
        'no-console': 'off', // ログ出力のためconsole使用を許可
        'no-debugger': 'error',
        'no-alert': 'error',
        
        // Code style
        'indent': ['error', 4],
        'linebreak-style': ['error', 'unix'],
        'quotes': ['error', 'single'],
        'semi': ['error', 'always'],
        'comma-dangle': ['error', 'never'],
        'brace-style': ['error', '1tbs'],
        'keyword-spacing': 'error',
        'space-before-blocks': 'error',
        'space-infix-ops': 'error',
        'object-curly-spacing': ['error', 'always'],
        'array-bracket-spacing': ['error', 'never'],
        
        // Best practices
        'eqeqeq': ['error', 'always'],
        'curly': ['error', 'all'],
        'no-var': 'error',
        'prefer-const': 'error',
        'no-magic-numbers': ['warn', { 
            'ignore': [0, 1, -1], 
            'ignoreArrayIndexes': true,
            'ignoreDefaultValues': true 
        }],
        'no-duplicate-imports': 'error',
        'no-return-await': 'error',
        
        // Error prevention
        'no-unreachable': 'error',
        'no-undef': 'error',
        'no-unused-expressions': 'error',
        'no-implicit-globals': 'error',
        'handle-callback-err': 'error',
        'no-process-exit': 'warn',
        
        // Node.js specific
        'no-path-concat': 'error',
        'no-new-require': 'error',
        'no-mixed-requires': 'error'
    },
    overrides: [
        {
            files: ['**/__tests__/**/*.js', '**/*.test.js'],
            env: {
                jest: true
            },
            rules: {
                'no-magic-numbers': 'off' // テストではマジックナンバーを許可
            }
        }
    ]
};