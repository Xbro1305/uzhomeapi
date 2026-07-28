/**
 * Гибкое распознавание полей выгрузки 1С.
 *
 * Пока Владимир не зафиксировал названия колонок, выгрузка может прийти с
 * любыми ключами: "Код", "code", "Kod", "Артикул", "article"... Эта функция
 * приводит одну сырую позицию к нашей структуре, пробуя множество вариантов
 * написания. Всё, что не распозналось, остаётся в поле raw.
 */

// нормализуем ключ: убираем пробелы/подчёркивания, в нижний регистр
function norm(key) {
  return String(key).toLowerCase().replace(/[\s_\-.]/g, "");
}

// словари синонимов (в нормализованном виде)
const ALIASES = {
  code: [
    "код", "кодноменклатуры", "кодтовара", "код1с", "code", "kod",
    "nomenclaturecode", "productcode", "id", "guid", "ссылка",
  ],
  article: ["артикул", "article", "artikul", "art", "sku"],
  name: [
    "наименование", "название", "номенклатура", "товар", "name",
    "naimenovanie", "nomenklatura", "title",
  ],
  warehouse: ["склад", "warehouse", "sklad", "store", "магазин"],
  quantity: [
    "количество", "остаток", "остатки", "втоваре", "quantity", "kolichestvo",
    "ostatok", "qty", "count", "вналичии", "балансколичество",
  ],
  available: [
    "доступно", "доступнокпродаже", "свободно", "available", "dostupno",
    "free", "квыдаче",
  ],
  reserved: ["резерв", "врезерве", "reserved", "reserv", "rezerv", "забронировано"],
  unit: [
    "единица", "единицаизмерения", "едизм", "unit", "edizm", "ед", "uom",
    "measure",
  ],
  price: ["цена", "стоимость", "price", "cena", "стоимостьпродажи", "ценапродажи"],
  rollLength: [
    "длинарулона", "метровврулоне", "rolllength", "длина", "метраж", "length",
    "метров", "длинаметр",
  ],
};

// строим обратный индекс: нормализованный ключ -> наше имя поля
const KEY_INDEX = {};
for (const [field, aliases] of Object.entries(ALIASES)) {
  for (const a of aliases) KEY_INDEX[a] = field;
}

function toNumber(v) {
  if (v === null || v === undefined) return undefined;
  // 1С может прислать "12,5" или "1 200" или "12.00"
  const cleaned = String(v).replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Принимает сырую позицию (объект с любыми ключами).
 * Возвращает { mapped, code, raw } либо null, если код найти не удалось.
 */
export function mapStockItem(raw) {
  if (!raw || typeof raw !== "object") return null;

  const mapped = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = KEY_INDEX[norm(key)];
    if (!field) continue;
    if (["quantity", "available", "reserved", "price", "rollLength"].includes(field)) {
      const n = toNumber(value);
      if (n !== undefined) mapped[field] = n;
    } else {
      mapped[field] = String(value).trim();
    }
  }

  const code = mapped.code || "";
  if (!code) return null; // без кода позицию не привязать

  return { code, mapped, raw };
}
