import { z } from 'zod';

export const searchRequestSchema = z.object({
  q: z.string({ required_error: 'Query parameter "q" is required' }).min(1, 'Query cannot be empty'),
  type: z.string().optional(),
  limit: z.preprocess((val) => (val ? parseInt(val as string, 10) : 20), z.number().int().min(1).max(100).default(20)),
  offset: z.preprocess((val) => (val ? parseInt(val as string, 10) : 0), z.number().int().min(0).default(0)),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;
