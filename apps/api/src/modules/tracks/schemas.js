import { z } from 'zod';

export const MAX_ITEMS = 100;

const title = z.string().trim().min(1, 'Informe um título.').max(120);
const description = z.string().trim().max(1000);

export const trackCreate = z.object({
  title,
  description: description.default(''),
  /** Cursos já na trilha, na ordem escolhida (repetidos são ignorados). */
  courseIds: z
    .array(z.number().int().positive())
    .max(MAX_ITEMS)
    .default([])
    .transform((ids) => [...new Set(ids)]),
});
export const trackUpdate = z.object({ title: title.optional(), description: description.optional() });

export const itemCreate = z
  .object({
    courseId: z.number().int().positive().nullish(),
    title: z.string().trim().max(200).optional(),
  })
  .refine((i) => i.courseId || (i.title && i.title.length > 0), 'Escolha um curso ou escreva o nome da etapa.');

export const itemUpdate = z
  .object({
    done: z.boolean().optional(),
    title: z.string().trim().min(1, 'Informe um nome.').max(200).optional(),
  })
  .refine((i) => i.done !== undefined || i.title !== undefined, 'Nada para alterar.');

export const orderBody = z.object({ itemIds: z.array(z.number().int().positive()).max(MAX_ITEMS) });
