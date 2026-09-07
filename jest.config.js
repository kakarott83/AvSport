/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',

  setupFiles: ['<rootDir>/jest.setup.js'],

  // Only transform what actually needs it; skip heavy native modules
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|@supabase/.*)',
  ],

  // Resolve the "@/" path alias defined in tsconfig.json
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },

  // Only pick up .test.ts / .test.tsx files (no .spec or native-specific suffixes)
  testMatch: ['**/?(*.)+(test).[jt]s?(x)'],

  // Faster, lighter environment for pure-logic tests
  testEnvironment: 'node',
};
