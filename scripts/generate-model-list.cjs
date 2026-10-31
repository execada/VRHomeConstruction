/**
 * Генерирует src/features/furniture/modelList.ts со списком пользовательских моделей
 * из public/models (пути и размеры файлов). Запускается перед dev/build.
 */
const fs = require('fs');
const path = require('path');

const publicDir = path.resolve(__dirname, '../public');
const modelsDir = path.join(publicDir, 'models');
const outputFile = path.resolve(__dirname, '../src/features/furniture/modelList.ts');

/** Рекурсивно собрать .glb/.gltf файлы. */
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!/\.(glb|gltf)$/i.test(entry.name)) return [];
    const relative = '/' + path.relative(publicDir, fullPath).replace(/\\/g, '/');
    return [{ path: relative, size: fs.statSync(fullPath).size }];
  });
}

const models = walk(modelsDir).sort((a, b) => a.path.localeCompare(b.path));
const sizes = Object.fromEntries(models.map((m) => [m.path, m.size]));

const content = `// Автоматически сгенерировано scripts/generate-model-list.cjs. Не редактировать вручную.
// Имя модели из пути берётся через shared-утилиту getModelName (@/shared/utils/getModelName).
export const modelPaths: string[] = ${JSON.stringify(models.map((m) => m.path), null, 2)};

/** Размер файла модели, байт */
export const modelSizes: Record<string, number> = ${JSON.stringify(sizes, null, 2)};
`;

fs.writeFileSync(outputFile, content, 'utf-8');
console.log(`Сгенерирован modelList.ts с ${models.length} моделями`);
