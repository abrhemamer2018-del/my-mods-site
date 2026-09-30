// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // غيّر هذا الرابط إلى دومين موقعك بعد النشر
  site: 'https://ta3reebat.com',
  trailingSlash: 'ignore',
  integrations: [sitemap({ filter: (page) => !page.includes('/admin') })],
});
