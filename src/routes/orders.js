import express from "express";
import Order from "../models/Order.js";
import Stock from "../models/Stock.js";
import Fabric from "../models/Fabric.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  sendTelegram,
  formatOrderMessage,
  answerCallback,
  editMessage,
  orderKeyboard,
  STATUS_LABEL,
  PICKUP_ADDRESS,
} from "../utils/telegram.js";

const router = express.Router();

function genOrderNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `UZ-${ymd}-${rnd}`;
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

async function rollback(reservedSoFar) {
  for (const { code, meters } of reservedSoFar) {
    await Stock.updateOne(
      { nomenclatureCode: code },
      { $inc: { reserved: -meters } }
    ).catch(() => {});
  }
}

async function releaseReservation(order) {
  if (order.reservationReleased) return;
  for (const it of order.items) {
    await Stock.updateOne(
      { nomenclatureCode: it.nomenclatureCode },
      { $inc: { reserved: -it.meters } }
    ).catch(() => {});
  }
  order.reservationReleased = true;
}

// Применить смену статуса с корректной работой брони/остатка. Используется
// и в админ-API, и в обработчике кнопок Telegram.
async function applyStatusChange(order, status) {
  if (status === "cancelled") {
    await releaseReservation(order); // снять бронь
  }
  if (status === "completed" && !order.reservationReleased) {
    // продано: списываем и остаток, и бронь
    for (const it of order.items) {
      await Stock.updateOne(
        { nomenclatureCode: it.nomenclatureCode },
        { $inc: { quantity: -it.meters, reserved: -it.meters } }
      ).catch(() => {});
    }
    order.reservationReleased = true;
  }
  order.status = status;
  await order.save();
  return order;
}

/**
 * POST /api/orders — заказ без регистрации.
 * Тело:
 * {
 *   customerName, customerPhone, comment,
 *   items: [ { nomenclatureCode, meters }, ... ]
 * }
 * Метраж должен быть кратен длине рулона ткани (шаг). Бронь атомарная в метрах.
 */
router.post("/", async (req, res) => {
  const { customerName, customerPhone, comment, items } = req.body;

  if (!customerName || !String(customerName).trim()) {
    return res.status(400).json({ message: "Укажите имя" });
  }
  const phone = normalizePhone(customerPhone);
  if (phone.length < 7) {
    return res.status(400).json({ message: "Укажите корректный телефон" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Корзина пуста" });
  }

  // сворачиваем дубли кодов, суммируя метраж
  const wanted = new Map();
  for (const it of items) {
    const code = String(it.nomenclatureCode || "").trim();
    const meters = Math.round(Number(it.meters) || 0);
    if (!code || meters < 1) {
      return res.status(400).json({ message: "Некорректная позиция в заказе" });
    }
    wanted.set(code, (wanted.get(code) || 0) + meters);
  }

  const reservedSoFar = [];

  try {
    const orderItems = [];

    for (const [code, meters] of wanted.entries()) {
      // данные ткани по коду номенклатуры (для цены, шага, названия)
      const fabric = await Fabric.findOne({ "colors.nomenclatureCode": code });
      const rollLength = Math.max(1, Number(fabric?.rollLength) || 50);

      // метраж должен быть кратен длине рулона
      if (meters % rollLength !== 0) {
        await rollback(reservedSoFar);
        return res.status(400).json({
          message: `Метраж должен быть кратен длине рулона (${rollLength} м)`,
          nomenclatureCode: code,
          rollLength,
        });
      }

      // Атомарная бронь: reserved += meters, только если хватает доступного.
      const updated = await Stock.findOneAndUpdate(
        {
          nomenclatureCode: code,
          $expr: { $lte: [{ $add: ["$reserved", meters] }, "$quantity"] },
        },
        { $inc: { reserved: meters } },
        { new: true }
      );

      if (!updated) {
        await rollback(reservedSoFar);
        const cur = await Stock.findOne({ nomenclatureCode: code });
        const available = cur ? Math.max(0, cur.quantity - cur.reserved) : 0;
        return res.status(409).json({
          message: "Недостаточно остатка",
          nomenclatureCode: code,
          requested: meters,
          available,
        });
      }
      reservedSoFar.push({ code, meters });

      // обогащаем позицию данными карточки
      let colorName = "";
      let imageUrl = "";
      let currency = "сум";
      let fabricId = null;
      let name = updated.name;
      let pricePerMeter = 0;

      if (fabric) {
        fabricId = fabric._id;
        name = fabric.name || updated.name;
        currency = fabric.currency || "сум";
        // цена за метр: если цена задана за рулон — делим на длину рулона
        const isPerRoll = (fabric.priceUnit || "").includes("рулон");
        pricePerMeter = isPerRoll
          ? fabric.price / rollLength
          : fabric.price;
        const color = fabric.colors.find((c) => c.nomenclatureCode === code);
        if (color) {
          colorName = color.name;
          imageUrl = color.imageUrl;
        }
      }

      orderItems.push({
        nomenclatureCode: code,
        fabricId,
        name,
        article: updated.article,
        colorName,
        imageUrl,
        meters,
        rollLength,
        pricePerMeter,
        currency,
      });
    }

    const totalMeters = orderItems.reduce((s, i) => s + i.meters, 0);
    const totalAmount = orderItems.reduce(
      (s, i) => s + i.pricePerMeter * i.meters,
      0
    );
    const currency = orderItems[0]?.currency || "сум";

    const order = await Order.create({
      orderNumber: genOrderNumber(),
      customerName: String(customerName).trim(),
      customerPhone: phone,
      comment: String(comment || "").trim(),
      items: orderItems,
      totalMeters,
      totalAmount,
      currency,
      pickupAddress: PICKUP_ADDRESS,
      status: "new",
    });

    const tg = await sendTelegram(
      formatOrderMessage(order),
      orderKeyboard(order._id, "new")
    );
    if (tg.ok) {
      order.telegramNotified = true;
      await order.save();
    }

    res.status(201).json({
      message: "Заказ принят",
      orderNumber: order.orderNumber,
      orderId: order._id,
      totalMeters,
      totalAmount,
      currency,
      pickupAddress: PICKUP_ADDRESS,
    });
  } catch (error) {
    await rollback(reservedSoFar);
    res
      .status(500)
      .json({ message: "Ошибка создания заказа", error: error.message });
  }
});

// ---------- Админские маршруты ----------

router.get("/admin", authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

router.get("/admin/:id", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Заказ не найден" });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

/**
 * PATCH /api/orders/admin/:id/status
 * confirmed → бронь остаётся; cancelled → бронь снимается;
 * completed → списываем (quantity -= meters, reserved -= meters).
 */
router.patch("/admin/:id/status", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["new", "confirmed", "cancelled", "completed"].includes(status)) {
      return res.status(400).json({ message: "Недопустимый статус" });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Заказ не найден" });

    await applyStatusChange(order, status);
    res.json(order);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Ошибка обновления", error: error.message });
  }
});

/**
 * POST /api/orders/tg/webhook — обработка нажатий inline-кнопок в Telegram.
 * Telegram шлёт callback_query с data вида "ord:<orderId>:<status>".
 * Защита — секрет в заголовке X-Telegram-Bot-Api-Secret-Token.
 */
router.post("/tg/webhook", async (req, res) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (
    secret &&
    req.headers["x-telegram-bot-api-secret-token"] !== secret
  ) {
    return res.sendStatus(401);
  }
  res.sendStatus(200); // подтверждаем приём сразу

  const cq = req.body?.callback_query;
  if (!cq) {
    console.log("[tg/webhook] нет callback_query, body-keys:", Object.keys(req.body || {}));
    return;
  }
  try {
    const [prefix, orderId, status] = String(cq.data || "").split(":");
    console.log(`[tg/webhook] data=${cq.data} prefix=${prefix} id=${orderId} status=${status}`);
    if (prefix !== "ord") return;
    if (!["confirmed", "completed", "cancelled"].includes(status)) {
      await answerCallback(cq.id, "Неизвестная команда");
      return;
    }
    const order = await Order.findById(orderId);
    console.log(`[tg/webhook] order found=${!!order} curStatus=${order?.status}`);
    if (!order) {
      await answerCallback(cq.id, "Заказ не найден");
      return;
    }
    if (order.status === status) {
      await answerCallback(cq.id, `Уже: ${STATUS_LABEL[status]}`);
      return;
    }
    await applyStatusChange(order, status);
    console.log(`[tg/webhook] applied -> ${order.status}`);
    await answerCallback(cq.id, `Статус: ${STATUS_LABEL[status]}`);

    // обновляем сообщение: добавляем статус и подгоняем кнопки
    if (cq.message) {
      const who = cq.from?.first_name || cq.from?.username || "";
      const text =
        formatOrderMessage(order) +
        `\n\n<b>Статус: ${STATUS_LABEL[status]}</b>${who ? ` · ${who}` : ""}`;
      await editMessage(
        cq.message.chat.id,
        cq.message.message_id,
        text,
        orderKeyboard(order._id, status)
      );
    }
  } catch (e) {
    console.error("tg webhook error:", e.message);
  }
});

export default router;
