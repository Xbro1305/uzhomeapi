/**
 * Отправка уведомлений в Telegram (заказы и заявки с сайта).
 * Bot API напрямую через fetch (Node 18+), без доп. зависимостей.
 *
 * Нужны env:
 *   TELEGRAM_BOT_TOKEN — токен бота от @BotFather
 *   TELEGRAM_CHAT_ID   — id чата/группы, куда слать
 */

export const PICKUP_ADDRESS = "Иваново, Сосновая 1";

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString("ru-RU");
}

export async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn(
      "⚠️  TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы — уведомление не отправлено"
    );
    return { ok: false, reason: "not_configured" };
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );
    const data = await res.json();
    if (!data.ok) {
      console.error("❌ Telegram вернул ошибку:", data.description);
      return { ok: false, reason: data.description };
    }
    return { ok: true };
  } catch (err) {
    console.error("❌ Не удалось отправить в Telegram:", err.message);
    return { ok: false, reason: err.message };
  }
}

// ---- Заказ ----
export function formatOrderMessage(order) {
  const lines = [];
  lines.push(`🛒 <b>Новый заказ ${escapeHtml(order.orderNumber)}</b>`);
  lines.push("");
  lines.push(`👤 <b>Имя:</b> ${escapeHtml(order.customerName)}`);
  lines.push(`📞 <b>Телефон:</b> ${escapeHtml(order.customerPhone)}`);
  if (order.comment)
    lines.push(`💬 <b>Комментарий:</b> ${escapeHtml(order.comment)}`);
  lines.push("");
  lines.push("<b>Состав заказа:</b>");
  order.items.forEach((it, i) => {
    const title = [it.name, it.colorName].filter(Boolean).join(" — ");
    const sum = fmtNum(it.pricePerMeter * it.meters);
    lines.push(
      `${i + 1}. ${escapeHtml(title)} (арт. ${escapeHtml(it.article || "—")}, код ${escapeHtml(it.nomenclatureCode)})`
    );
    lines.push(
      `   ${fmtNum(it.meters)} м · ${fmtNum(it.pricePerMeter)} ${escapeHtml(it.currency)}/м = <b>${sum} ${escapeHtml(it.currency)}</b>`
    );
  });
  lines.push("");
  lines.push(
    `📦 <b>Итого:</b> ${fmtNum(order.totalMeters)} м · <b>${fmtNum(order.totalAmount)} ${escapeHtml(order.currency)}</b>`
  );
  lines.push("");
  lines.push(`🚚 <b>Самовывоз с адреса:</b> ${escapeHtml(order.pickupAddress || PICKUP_ADDRESS)}`);
  return lines.join("\n");
}

// ---- Заявка с формы обращения ----
export function formatContactMessage({ name, phone, email, message }) {
  const lines = [];
  lines.push("✉️ <b>Новая заявка с сайта</b>");
  lines.push("");
  if (name) lines.push(`👤 <b>Имя:</b> ${escapeHtml(name)}`);
  if (phone) lines.push(`📞 <b>Телефон:</b> ${escapeHtml(phone)}`);
  if (email) lines.push(`✉️ <b>Email:</b> ${escapeHtml(email)}`);
  if (message) lines.push(`💬 <b>Сообщение:</b> ${escapeHtml(message)}`);
  return lines.join("\n");
}
