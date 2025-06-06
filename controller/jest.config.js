module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/__tests__/**/*.js',
        '**/?(*.)+(spec|test).js'
    ],
    collectCoverageFrom: [
        'process_manager.js',
        '!jest.config.js',
        '!.eslintrc.js',
        '!coverage/**',
        '!node_modules/**',
        '!docker_manager.js'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: [
        'text',
        'text-summary',
        'html',
        'lcov'
    ],
    coverageThreshold: {
        global: {
            branches: 25,
            functions: 45,
            lines: 45,
            statements: 45
        }
    },
    setupFilesAfterEnv: [],
    testTimeout: 10000,
    verbose: true,
    collectCoverage: false, // デフォルトでは無効、npm run test:coverageで有効化
    clearMocks: true,
    restoreMocks: true
};