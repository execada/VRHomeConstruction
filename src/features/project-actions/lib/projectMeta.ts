/**
 * Проверка названия, описания и тегов проекта (те же ограничения, что на сервере):
 * название 1–120 символов, описание до 500, до 10 тегов по 1–32 символа без повторов.
 * @module project-actions/lib/projectMeta
 */

import { z } from 'zod';

export const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 32;

/** Разобрать строку тегов «кухня, лофт, #светлый» → ['кухня', 'лофт', 'светлый'] без повторов. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[,;\n]/)
    .map((tag) => tag.trim().replace(/^#+/, '').replace(/\s+/g, ' '))
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export const projectMetaSchema = z.object({
  name: z.string().trim().min(1, 'Введите название').max(120, 'Название — не длиннее 120 символов'),
  description: z.string().trim().max(500, 'Описание — не длиннее 500 символов'),
  tags: z
    .array(z.string().max(MAX_TAG_LENGTH, `Тег — не длиннее ${MAX_TAG_LENGTH} символов`))
    .max(MAX_TAGS, `Не больше ${MAX_TAGS} тегов`),
});

export type ProjectMeta = z.infer<typeof projectMetaSchema>;

type MetaErrors = Partial<Record<keyof ProjectMeta, string>>;

/**
 * Проверить введённые данные. Ошибки — по полям, чтобы показать их рядом с вводом.
 * @param input - название, описание и строка тегов из формы
 */
export function validateProjectMeta(input: { name: string; description: string; tags: string }): { ok: true; value: ProjectMeta } | { ok: false; errors: MetaErrors } {
  const parsed = projectMetaSchema.safeParse({ name: input.name, description: input.description, tags: parseTags(input.tags) });
  if (parsed.success) return { ok: true, value: parsed.data };
  const errors: MetaErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof ProjectMeta;
    errors[field] ??= issue.message;
  }
  return { ok: false, errors };
}
