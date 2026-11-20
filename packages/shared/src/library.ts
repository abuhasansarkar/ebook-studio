import { z } from 'zod';
import { BOOK_STATUSES, BOOK_TYPES } from './schemas';
import { LANGUAGE_CODES } from './languages';
export const projectSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).default('') });
export const libraryQuerySchema = z.object({
  search: z.string().trim().max(200).optional(), projectId: z.string().min(1).max(100).optional(),
  language: z.enum(LANGUAGE_CODES).optional(), bookType: z.enum(BOOK_TYPES).optional(), status: z.enum(BOOK_STATUSES).optional(),
  archived: z.enum(['active', 'archived', 'all']).default('active'), sort: z.enum(['newest', 'oldest', 'title']).default('newest'),
  cursor: z.string().min(1).max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(24),
});
export type LibraryQuery = z.output<typeof libraryQuerySchema>;
export const bookOrganizationSchema = z.object({ projectId: z.string().min(1).max(100).nullable().optional(), archived: z.boolean().optional() }).refine(v => Object.keys(v).length > 0, 'Choose a change');
