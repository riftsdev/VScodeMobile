import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',timeout:45000,expect:{timeout:15000},fullyParallel:true,retries:1,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4173/VScodeMobile/',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}},{name:'webkit-mobile',use:{...devices['iPhone 13']}}],
  webServer:{command:'npm run serve',url:'http://127.0.0.1:4173/VScodeMobile/',reuseExistingServer:!process.env.CI}
});