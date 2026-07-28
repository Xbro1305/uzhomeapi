import express from "express";
import Stock from "../models/Stock.js";
import { authMiddleware } from "../middleware/auth.js";
import { ingestTokenMiddleware } from "../middleware/ingestToken.js";
import { mapStockItem } from "../utils/stockMapper.js";

const router = express.Router();

/**
 * POST /api/stock/sync — приём остатков из 1С.
 *
 * ⚠️ РЕЖИМ ТЕСТИРОВАНИЯ ФОРМАТА:
 * Пока Владимир не зафиксировал названия колонок, endpoint принимает ЛЮБЫЕ
 * ключи. Он сам распознаёт код/количество/наименование по множеству вариантов
 * написания ("Код", "code", "Kod", "Артикул"...), а всё сырьё сохраняет в raw.
 *
 * Принимает тело в любом из видов:
 *   { "items": [ {...}, {...} ] }
 *   [ {...}, {...} ]              — просто массив
 *   { ...одна позиция... }        — один объект
 *
 * Единственное обязательное условие — в позиции должен угадываться КОД
 * (любой из: Код, code, Kod, nomenclatureCode, id, ссылка...). Без него
 * позицию не к чему привязать, она попадёт в skipped, но ответ покажет это.
 *
 * Токен (STOCK_INGEST_TOKEN) проверяется, только если он задан в окружении.
 * На время тестов можно его не задавать — тогда endpoint открыт. Перед
 * боевым запуском обязательно задайте токен.
 */
function maybeCheckToken(req, res, next) {
  if (process.env.STOCK_INGEST_TOKEN) {
    return ingestTokenMiddleware(req, res, next);
  }
  // токен не настроен — пропускаем (режим тестирования)
  console.warn(
    "⚠️  STOCK_INGEST_TOKEN не задан — /api/stock/sync открыт без токена (тестовый режим)"
  );
  next();
}

function extractItems(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.Остатки)) return body.Остатки;
  if (body && typeof body === "object") return [body]; // одна позиция
  return null;
}

router.post("/sync", maybeCheckToken, async (req, res) => {
  try {
    const items = extractItems(req.body);
    if (!items) {
      return res.status(400).json({
        message:
          "Не нашёл позиций. Пришлите массив или { items: [...] } с объектами внутри.",
      });
    }

    // Режим полной выгрузки (снимок всех остатков за один запрос).
    // Включается флагом ?mode=full / ?full=1 в URL, либо { "full": true }
    // / { "mode": "full" } в теле (когда тело — объект-обёртка, не массив).
    // В этом режиме позиции, которых НЕТ в этой выгрузке, обнуляются
    // (quantity=0) — чтобы распроданный товар не «висел» в наличии. Бронь
    // при этом сохраняется. ВАЖНО: полный снимок должен прийти ОДНИМ
    // запросом; если 1С шлёт постранично — full включать нельзя (иначе
    // первая страница обнулит остальные). Для дельта-выгрузки не включать.
    const fullSync =
      req.query.mode === "full" ||
      req.query.full === "1" ||
      req.query.full === "true" ||
      req.body?.full === true ||
      req.body?.mode === "full";

    const now = new Date();
    const results = {
      received: items.length,
      upserted: 0,
      skipped: 0,
      recognizedFields: new Set(),
      skippedExamples: [],
      sample: null,
    };

    const ops = [];
    for (const rawItem of items) {
      const parsed = mapStockItem(rawItem);
      if (!parsed) {
        results.skipped++;
        if (results.skippedExamples.length < 3) {
          results.skippedExamples.push({
            item: rawItem,
            reason: "не удалось найти КОД позиции",
          });
        }
        continue;
      }

      const { code, mapped, raw } = parsed;
      Object.keys(mapped).forEach((f) => results.recognizedFields.add(f));

      // собираем $set только из распознанного
      const set = { lastSyncedAt: now, raw };
      if (mapped.article !== undefined) set.article = mapped.article;
      if (mapped.name !== undefined) set.name = mapped.name;
      if (mapped.warehouse !== undefined) set.warehouse = mapped.warehouse;
      if (mapped.unit !== undefined) set.unit = mapped.unit;
      if (mapped.price !== undefined) set.price = mapped.price;
      if (mapped.rollLength !== undefined) set.rollLength = mapped.rollLength;

      // Количество: если прислали "Доступно" — кладём его в quantity
      // (резерв тогда считаем только по нашим бронькам). Иначе берём quantity.
      if (mapped.available !== undefined) {
        set.quantity = Math.max(0, mapped.available);
      } else if (mapped.quantity !== undefined) {
        set.quantity = Math.max(0, mapped.quantity);
      }

      ops.push({
        updateOne: {
          filter: { nomenclatureCode: code },
          update: { $set: set, $setOnInsert: { reserved: 0 } },
          upsert: true,
        },
      });

      if (!results.sample) {
        results.sample = { nomenclatureCode: code, ...set };
        delete results.sample.raw; // в примере raw не показываем — он длинный
      }
    }

    if (ops.length > 0) {
      const bulk = await Stock.bulkWrite(ops, { ordered: false });
      results.upserted =
        (bulk.upsertedCount || 0) +
        (bulk.modifiedCount || 0) +
        (bulk.matchedCount || 0);
    }

    // Полная выгрузка: всё, что не пришло в этом снимке (lastSyncedAt раньше
    // текущего прогона), считаем распроданным — обнуляем quantity. Бронь
    // (reserved) не трогаем. Делаем только если в снимке реально были позиции,
    // чтобы пустой/битый запрос не обнулил весь каталог.
    let prunedToZero = 0;
    if (fullSync && ops.length > 0) {
      const pruneRes = await Stock.updateMany(
        { lastSyncedAt: { $lt: now }, quantity: { $gt: 0 } },
        { $set: { quantity: 0, lastSyncedAt: now } }
      );
      prunedToZero = pruneRes.modifiedCount || 0;
    }

    // ответ показывает, что распозналось — чтобы Владимир сразу увидел результат
    res.json({
      message: "Принято",
      mode: fullSync ? "full" : "partial",
      received: results.received,
      saved: results.upserted,
      skipped: results.skipped,
      prunedToZero, // сколько позиций обнулено как отсутствующие в полной выгрузке
      recognizedFields: [...results.recognizedFields],
      skippedExamples: results.skippedExamples,
      sampleSaved: results.sample,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Ошибка синхронизации", error: error.message });
  }
});

/**
 * GET /api/stock/availability?codes=CODE1,CODE2
 * Публичный. Возвращает доступное к продаже по кодам номенклатуры.
 * Если codes не передан — возвращает все позиции с остатком > 0.
 */
router.get("/availability", async (req, res) => {
  try {
    const filter = {};
    if (req.query.codes) {
      const codes = String(req.query.codes)
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      filter.nomenclatureCode = { $in: codes };
    }
    const stocks = await Stock.find(filter);
    const map = {};
    stocks.forEach((s) => {
      map[s.nomenclatureCode] = {
        available: s.available,
        quantity: s.quantity,
        reserved: s.reserved,
        rollLength: s.rollLength,
        lastSyncedAt: s.lastSyncedAt,
      };
    });
    res.json(map);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

/**
 * GET /api/stock/admin — полный список остатков (для админки).
 * Показывает, когда последний раз приходила выгрузка из 1С.
 */
router.get("/admin", authMiddleware, async (req, res) => {
  try {
    const stocks = await Stock.find().sort({ lastSyncedAt: -1, name: 1 });
    res.json(stocks);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

/**
 * PUT /api/stock/admin/:code — ручная правка остатка (админ).
 * На случай если 1С ещё не подключена — можно вести вручную.
 */
router.put("/admin/:code", authMiddleware, async (req, res) => {
  try {
    const { quantity, article, name, rollLength, warehouse } = req.body;
    const update = {};
    if (quantity !== undefined)
      update.quantity = Math.max(0, Number(quantity) || 0);
    if (article !== undefined) update.article = article;
    if (name !== undefined) update.name = name;
    if (rollLength !== undefined) update.rollLength = Number(rollLength) || 50;
    if (warehouse !== undefined) update.warehouse = warehouse;

    const stock = await Stock.findOneAndUpdate(
      { nomenclatureCode: req.params.code },
      { $set: update, $setOnInsert: { reserved: 0 } },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(stock);
  } catch (error) {
    res.status(500).json({ message: "Ошибка обновления", error: error.message });
  }
});

export default router;
