import { z } from 'zod';

export const STATUSES = ['planned', 'active', 'paused', 'completed'];

const tags = z
  .array(z.string().trim().min(1).max(30))
  .max(10)
  .transform((arr) => [...new Set(arr.map((t) => t.toLowerCase()))]);

export const courseCreate = z.object({
  title: z.string().trim().min(1, 'Informe um título.').max(160),
  platform: z.string().trim().min(1).max(60).default('Outro'),
  category: z.string().trim().min(1).max(60).default('Geral'),
  description: z.string().trim().max(2000).default(''),
  url: z.string().trim().url().max(500).nullish(),
  status: z.enum(STATUSES).default('active'),
  manualProgress: z.number().int().min(0).max(100).default(0),
  tags: tags.default([]),
});

export const courseUpdate = courseCreate.partial();

export const courseStatus = z.object({ status: z.enum(STATUSES) });

export const courseQuery = z.object({
  status: z.enum(STATUSES).optional(),
  platform: z.string().trim().optional(),
  category: z.string().trim().optional(),
  q: z.string().trim().optional(),
});

export const moduleCreate = z.object({
  title: z.string().trim().min(1).max(160),
});

export const lessonCreate = z.object({
  title: z.string().trim().min(1).max(200),
  durationMin: z.number().int().min(0).max(1000).default(0),
});

export const lessonUpdate = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  durationMin: z.number().int().min(0).max(1000).optional(),
  completed: z.boolean().optional(),
  lastPositionSec: z.number().int().min(0).optional(),
});
