import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const assetPath = z
  .string()
  .refine((p) => existsSync(join(process.cwd(), 'public', p)), {
    message: 'Файл не знайдено в public/ — перевірте шлях до зображення',
  });

const slides = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/slides' }),
  schema: z.strictObject({
    section: z.string(),
    title: z.string(),
    type: z.enum(['hero', 'photo']).optional(),
    cards: z.array(z.string()).optional(),
    stats: z.array(z.string()).optional(),
    dou: z.array(assetPath).optional(),
    chips: z
      .array(
        z.union([
          z.string(),
          z
            .strictObject({ text: z.string().optional(), logo: assetPath.optional() })
            .refine((o) => o.text || o.logo, 'чіп потребує text або logo'),
        ]),
      )
      .optional(),
    groups: z
      .array(
        z.strictObject({
          heading: z.string(),
          accent: z.enum(['purple', 'green', 'red']).optional(),
          items: z.array(z.string()),
        }),
      )
      .optional(),
    logogroups: z
      .array(
        z.strictObject({
          heading: z.string(),
          logos: z.array(z.union([assetPath, z.strictObject({ src: assetPath, h: z.number() })])),
        }),
      )
      .optional(),
    links: z.array(z.strictObject({ label: z.string(), url: z.url() })).optional(),
    logos: z.array(assetPath).optional(),
    note: z.string().optional(),
    credit: z.string().optional(),
    image: z.union([assetPath, z.array(assetPath)]).optional(),
    fit: z.literal('contain').optional(),
    pin: z
      .strictObject({
        label: z.string(),
        sub: z.string(),
        url: z.url(),
        side: z.enum(['left', 'right']).optional(),
        line: z.number().positive().max(1).optional(),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        ar: z.number().positive(),
      })
      .optional(),
    page: z.int().positive().optional(),
  }),
});

export const collections = { slides };
