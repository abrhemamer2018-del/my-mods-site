// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

// <lastmod> في الـ Sitemap: Bing يريد أن يعرف أي صفحة تحدّثت ومتى.
// التاريخ = أحدث تاريخ في ملف الصفحة (releaseDate أو updatedDate أو date أو تاريخ أي إصدار في changelog)
const DATE_RE = /^\s*(?:-\s*)?(?:releaseDate|updatedDate|date|at):\s*["']?(\d{4}-\d{2}-\d{2}[^"'\s]*)/gm;
function newestDate(file) {
  if (!existsSync(file)) return undefined;
  const front = readFileSync(file, 'utf-8').split(/^---\s*$/m)[1] ?? '';
  const times = [...front.matchAll(DATE_RE)].map((m) => Date.parse(m[1])).filter((t) => !Number.isNaN(t));
  return times.length ? new Date(Math.max(...times)) : undefined;
}
const TR_DIR = 'src/content/translations';
const AR_DIR = 'src/content/articles';
const trDate = (slug) => newestDate(`${TR_DIR}/${slug}/index.md`);
const arDate = (slug) => newestDate(`${AR_DIR}/${slug}.md`) ?? newestDate(`${AR_DIR}/${slug}/index.md`);
const newestOf = (dates) => {
  const t = dates.filter(Boolean).map((d) => d.getTime());
  return t.length ? new Date(Math.max(...t)) : undefined;
};
function addLastmod(item) {
  const path = new URL(item.url).pathname;
  let d;
  const m = path.match(/^\/(translations|articles)\/([^/]+)\/$/);
  if (m) d = m[1] === 'translations' ? trDate(decodeURIComponent(m[2])) : arDate(decodeURIComponent(m[2]));
  else if (path === '/' || path === '/translations/' || path === '/upcoming/')
    d = newestOf(readdirSync(TR_DIR).map(trDate));
  else if (path === '/articles/')
    d = newestOf(readdirSync(AR_DIR).map((f) => arDate(f.replace(/\.md$/, ''))));
  if (d) item.lastmod = d.toISOString();
  return item;
}

export default defineConfig({
  // غيّر هذا الرابط إلى دومين موقعك بعد النشر
  site: 'https://ta3reebat.com',
  trailingSlash: 'ignore',
  integrations: [sitemap({ filter: (page) => !page.includes('/admin'), serialize: addLastmod })],
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
