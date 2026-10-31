/**
 * Утилита для извлечения имени модели из пути к файлу.
 * @module shared/utils/getModelName
 */

/**
 * Извлекает имя модели из полного пути к файлу.
 * @param path - путь, например "/models/sofa.glb"
 * @returns имя модели без расширения, например "sofa"
 */
export const getModelName = (path: string) => {
  const fileName = path.split('/').pop() || '';
  return fileName.replace(/\.(glb|gltf)$/, '');
};