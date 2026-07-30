import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

/**
 * Генерация лёгких превью для карточек/каруселей.
 *
 * Оригиналы фото (2–5 МБ) грузить на витрину нельзя — мобильный Safari
 * декодирует их в память как несжатый битмап и падает. Поэтому для сетки
 * показываем превью (~1000px, WebP, ~100–250 КБ), а оригинал открывается
 * только в лайтбоксе.
 *
 * Превью лежат в uploads/thumbs/<имя>.webp и отдаются по /uploads/thumbs/...
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, "../../uploads");
const THUMBS_DIR = path.join(UPLOADS_DIR, "thumbs");

// максимальная сторона превью и качество WebP
const THUMB_MAX = 1000;
const THUMB_QUALITY = 80;

export function thumbUrlFor(filename) {
  const base = path.parse(filename).name; // имя без расширения
  return `/uploads/thumbs/${base}.webp`;
}

/**
 * Сгенерировать превью из оригинала (имя файла в uploads/).
 * Возвращает thumbUrl (`/uploads/thumbs/...webp`) либо "" при ошибке —
 * тогда фронт откатится на оригинал, сайт не сломается.
 */
export async function generateThumb(filename) {
  try {
    if (!filename) return "";
    if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });

    const src = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(src)) return "";

    const base = path.parse(filename).name;
    const out = path.join(THUMBS_DIR, `${base}.webp`);

    await sharp(src)
      .rotate() // учесть EXIF-ориентацию (иначе фото с телефона повернётся)
      .resize(THUMB_MAX, THUMB_MAX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toFile(out);

    return thumbUrlFor(filename);
  } catch (e) {
    console.error("⚠️  Не удалось создать превью для", filename, "-", e.message);
    return "";
  }
}

/**
 * Удалить превью по его thumbUrl (`/uploads/thumbs/...webp`).
 */
export function deleteThumb(thumbUrl) {
  try {
    if (!thumbUrl) return;
    const rel = thumbUrl.replace(/^\/uploads\//, "");
    const p = path.join(UPLOADS_DIR, rel);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* игнорируем — удаление превью не должно валить запрос */
  }
}
