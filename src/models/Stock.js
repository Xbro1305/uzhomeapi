import mongoose from "mongoose";

/**
 * Остаток по коду номенклатуры 1С.
 * Источник истины по наличию — эта коллекция (наполняется выгрузкой из 1С).
 * Бронь ведётся только у нас: reserved увеличивается при создании заказа.
 * Доступно к продаже = quantity - reserved.
 */
const stockSchema = new mongoose.Schema(
  {
    // Код номенклатуры из 1С — главный ключ связи. Уникален.
    nomenclatureCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    // Артикул (может повторяться у разных расцветок — поэтому НЕ ключ)
    article: { type: String, default: "", trim: true },
    name: { type: String, default: "", trim: true },
    // Остаток из 1С в штуках (рулонах)
    quantity: { type: Number, default: 0, min: 0 },
    // Забронировано нашими заказами (штук/рулонов)
    reserved: { type: Number, default: 0, min: 0 },
    // Метраж одного рулона (по умолчанию 50 м)
    rollLength: { type: Number, default: 50 },
    unit: { type: String, default: "рулон" },
    // Склад из 1С (если складов несколько)
    warehouse: { type: String, default: "", trim: true },
    // Цена из 1С (справочно; на витрине цена берётся из карточки Fabric)
    price: { type: Number, default: 0 },
    // Пока формат выгрузки не устоялся — сохраняем СЫРУЮ строку 1С как есть,
    // чтобы ничего не потерять и увидеть, какие ключи реально приходят.
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Когда 1С последний раз присылала данные по этой позиции
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Доступно к продаже (виртуальное поле)
stockSchema.virtual("available").get(function () {
  return Math.max(0, (this.quantity || 0) - (this.reserved || 0));
});

stockSchema.set("toJSON", { virtuals: true });
stockSchema.set("toObject", { virtuals: true });

export default mongoose.model("Stock", stockSchema);
