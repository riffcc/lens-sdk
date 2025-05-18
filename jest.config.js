// jest.config.js
export default {
  // Use the ts-jest preset for ESM
  preset: 'ts-jest/presets/default-esm',
  moduleNameMapper: {
    // If your TypeScript code or dependencies import files with a .js extension,
    // (even if they are .ts files pre-compilation), this helps resolve them.
    // e.g. import foo from './bar.js' -> import foo from './bar'
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  // Jest's default timeout is 5 seconds. Many of your tests have longer timeouts.
  // You can set them per test (as you've done) or increase the global default if needed.
  // testTimeout: 30000, // Example: 30 seconds global timeout for all tests
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // No need for 'extensionsToTreatAsEsm' or manual 'transform' if using the ESM preset
};