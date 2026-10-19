// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // غيّر هذا الرابط إلى دومين موقعك بعد النشر
  site: 'https://ta3reebat.com',
  trailingSlash: 'ignore',
  integrations: [sitemap({ filter: (page) => !page.includes('/admin') })],
  // الخطوط تُحمَّل من الموقع نفسه بدل Google Fonts (أسرع).
  // الخط البديل أثناء التحميل ("Tajawal Fallback") معرّف يدوياً أول global.css بمقاسات مطابقة للعربي،
  // لأن حساب Astro التلقائي مبني على الحروف الإنجليزية فيصغّر النص العربي للنصف (فتهتز الصفحة CLS)
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Tajawal',
      cssVariable: '--font-tajawal',
      weights: [400, 500, 700, 800],
      styles: ['normal'],
      subsets: ['arabic', 'latin'],
      fallbacks: ['Tajawal Fallback', 'system-ui', 'sans-serif'],
      optimizedFallbacks: false,
    },
    {
      provider: fontProviders.google(),
      name: 'Reem Kufi',
      cssVariable: '--font-reem-kufi',
      weights: [500, 700],
      styles: ['normal'],
      subsets: ['arabic', 'latin'],
      // بدون بديل خاص: أثناء تحميله تظهر العناوين بخط Tajawal (انظر --font-display في global.css)
      fallbacks: [],
      optimizedFallbacks: false,
    },
  ],
});
