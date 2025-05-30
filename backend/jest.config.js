module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!**/node_modules/**'
  ],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  moduleFileExtensions: ['js', 'json'],
  clearMocks: true,
  restoreMocks: true,
  // TODO: Increase coverage thresholds as more tests are added
  // Target: 80% coverage for all metrics
  coverageThreshold: {
    global: {
      branches: 15,
      functions: 20,
      lines: 15,
      statements: 15
    }
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};