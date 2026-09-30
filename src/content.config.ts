import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// كل تعريب = مجلد داخل src/content/translations يحتوي index.md والصور
const translations = defineCollection({
  loader: glob({
    pattern: '*/index.md',
    base: './src/content/translations',
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(), // الاسم الأصلي (إنجليزي)
      titleAr: z.string(), // الاسم بالعربية
      summary: z.string(), // وصف قصير يظهر في البطاقات والبانر
      category: z.enum(['modern', 'retro', 'vn', 'mod']),
      platforms: z.array(z.string()).default(['PC']),
      status: z.enum(['complete', 'beta', 'in-progress']).default('complete'),
      progress: z.number().min(0).max(100).optional(),
      releaseDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      version: z.string().default('1.0'),
      gameVersion: z.string().optional(), // نسخة اللعبة المدعومة
      featured: z.boolean().default(false), // يظهر في البانر الكبير بالرئيسية
      cover: image(),
      banner: image().optional(),
      screenshots: z.array(image()).default([]),
      downloads: z
        .array(z.object({ label: z.string(), url: z.string(), size: z.string().optional() }))
        .default([]),
      requirements: z.array(z.string()).default([]),
      team: z.array(z.object({ name: z.string(), role: z.string() })).default([]),
      changelog: z
        .array(
          z.object({
            version: z.string(),
            date: z.coerce.date(),
            notes: z.array(z.string()),
          }),
        )
        .default([]),
      draft: z.boolean().default(false),
    }),
});

// المقالات والدروس
const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      date: z.coerce.date(),
      kind: z.enum(['article', 'lesson']).default('article'),
      cover: image().optional(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    }),
});

export const collections = { translations, articles };
