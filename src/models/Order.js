import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    // Ссылка на позицию по коду номенклатуры 1С
    nomenclatureCode: { type: String, required: true, trim: true },
    fabricId: { type: mongoose.Schema.Types.ObjectId, ref: "Fabric" },
    name: { type: String, default: "" }, // название ткани на момент заказа
    article: { type: String, default: "" },
    colorName: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    // Продаём метражом, кратно длине рулона (шаг). Метраж — сколько заказали.
    meters: { type: Number, required: true, min: 1 },
    rollLength: { type: Number, default: 50 }, // шаг (длина рулона)
    pricePerMeter: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "сум" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
    // Заказ без регистрации: только имя и телефон
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, required: true, trim: true },
    comment: { type: String, default: "", trim: true },

    items: {
      type: [orderItemSchema],
      validate: [(v) => v.length > 0, "Заказ не может быть пустым"],
    },
    totalMeters: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    currency: { type: String, default: "сум" },

    // Пока только самовывоз
    deliveryType: { type: String, default: "Самовывоз" },
    pickupAddress: { type: String, default: "Иваново, Сосновая 1" },

    // new → бронь стоит; confirmed → подтверждён; cancelled → бронь снята;
    // completed → продано (списываем остаток)
    status: {
      type: String,
      enum: ["new", "confirmed", "cancelled", "completed"],
      default: "new",
    },
    reservationReleased: { type: Boolean, default: false },
    telegramNotified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);
