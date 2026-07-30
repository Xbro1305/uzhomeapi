/**
 * Разовый бэкфилл превью для уже загруженных фото расцветок.
 *
 * Проходит по всем тканям, для каждой расцветки с imageUrl генерирует
 * превью (если его ещё нет) и проставляет thumbUrl. Идемпотентен — можно
 * запускать повторно (по умолчанию пропускает уже готовые; с --force
 * перегенерирует все).
 *
 * Запуск (из каталога backend, где лежит .env):
 *   node scripts/backfill-thumbs.mjs
 *   node scripts/backfill-thumbs.mjs --force
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Fabric from "../src/models/Fabric.js";
import { generateThumb } from "../src/utils/imageThumb.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, "../uploads");
const THUMBS_DIR = path.join(UPLOADS_DIR, "thumbs");

const FORCE = process.argv.includes("--force");

function filenameFromUrl(url) {
  return String(url || "").replace(/^\/uploads\//, "");
}

function thumbExists(thumbUrl) {
  if (!thumbUrl) return false;
  const p = path.join(UPLOADS_DIR, thumbUrl.replace(/^\/uploads\//, ""));
  return fs.existsSync(p);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ Mongo подключена");
  if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });

  const fabrics = await Fabric.find();
  let total = 0,
    made = 0,
    skipped = 0,
    missingFile = 0,
    failed = 0;

  for (const fabric of fabrics) {
    let changed = false;
    for (const color of fabric.colors) {
      if (!color.imageUrl) continue;
      total++;

      // уже есть превью и файл на месте — пропускаем (если не --force)
      if (!FORCE && color.thumbUrl && thumbExists(color.thumbUrl)) {
        skipped++;
        continue;
      }

      const filename = filenameFromUrl(color.imageUrl);
      const srcPath = path.join(UPLOADS_DIR, filename);
      if (!fs.existsSync(srcPath)) {
        missingFile++;
        console.warn(`  ✗ нет файла: ${filename} (${fabric.name} / ${color.name})`);
        continue;
      }

      const thumbUrl = await generateThumb(filename);
      if (thumbUrl) {
        color.thumbUrl = thumbUrl;
        changed = true;
        made++;
        process.stdout.write(".");
      } else {
        failed++;
      }
    }
    if (changed) await fabric.save();
  }

  console.log("\n--- Итог ---");
  console.log("Всего расцветок с фото:", total);
  console.log("Создано превью:        ", made);
  console.log("Пропущено (уже были):  ", skipped);
  console.log("Нет исходного файла:   ", missingFile);
  console.log("Ошибок генерации:      ", failed);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("Ошибка бэкфилла:", e);
  process.exit(1);
});
