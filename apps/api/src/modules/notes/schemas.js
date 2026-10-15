import { z } from 'zod';

const tags = z
  .array(z.string().trim().min(1).max(30))
  .max(10)
  .transform((arr) => [...new Set(arr.map((t) => t.toLowerCase()))]);

const id = z.number().int().positive();

const fields = {
  title: z.string().trim().max(200),
  body: z.string().max(100000),
  courseId: id.nullable(),
  lessonId: id.nullable(),
  tags,
};

const hasContent = (n) => Boolean((n.title ?? '').trim() || (n.body ?? '').trim());
const EMPTY = 'Escreva um título ou um texto.';

export const noteCreate = z
  .object({
    title: fields.title.default(''),
    body: fields.body.default(''),
    courseId: fields.courseId.nullish(),
    lessonId: fields.lessonId.nullish(),
    tags: fields.tags.default([]),
  })
  .refine(hasContent, EMPTY);

export const noteUpdate = z.object(fields).partial();

export const noteQuery = z.object({
  q: z.string().trim().max(200).optional(),
  courseId: z.coerce.number().int().positive().optional(),
  lessonId: z.coerce.number().int().positive().optional(),
  tag: z.string().trim().max(30).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export { hasContent, EMPTY };
