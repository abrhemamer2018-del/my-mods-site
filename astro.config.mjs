// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // غيّر هذا الرابط إلى دومين موقعك بعد النشر
  site: 'https://ibrahimalobaidimods.abrhem-amer2018.workers.dev',
  trailingSlash: 'ignore',
  integrations: [sitemap({ filter: (page) => !page.includes('/admin') })],
});
