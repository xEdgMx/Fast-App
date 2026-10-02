/** Configuración de Jest para pruebas de integración del ledger. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/test/**/*.spec.ts'],
  globalSetup: '<rootDir>/test/global-setup.ts',
  moduleFileExtensions: ['ts', 'js', 'json'],
};
