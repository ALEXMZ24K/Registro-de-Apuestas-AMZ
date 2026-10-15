// Configuración del robot de pruebas: abre la app en modo prueba como iPhone y como Android
const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 45000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    screenshot: 'on',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  webServer: { command: 'python3 -m http.server 4173', port: 4173, reuseExistingServer: true },
  projects: [
    { name: 'iPhone', use: { ...devices['iPhone 13'] } },
    { name: 'Android', use: { ...devices['Pixel 7'] } },
  ],
});
