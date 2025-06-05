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
            branches: 75,
            functions: 65,
            lines: 70,
            statements: 70
        }
    },
    setupFilesAfterEnv: [],
    testTimeout: 10000,
    verbose: true,
    collectCoverage: false, // デフォルトでは無効、npm run test:coverageで有効化
    clearMocks: true,
    restoreMocks: true
};