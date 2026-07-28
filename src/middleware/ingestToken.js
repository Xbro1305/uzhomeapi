/**
 * Защита endpoint приёма остатков из 1С.
 * 1С шлёт заголовок:  Authorization: Bearer <STOCK_INGEST_TOKEN>
 * или:                X-Ingest-Token: <STOCK_INGEST_TOKEN>
 *
 * Это НЕ доступ к базе 1С — наоборот: 1С сама отправляет данные к нам,
 * а токен подтверждает, что запрос действительно от неё.
 */
export const ingestTokenMiddleware = (req, res, next) => {
  const expected = process.env.STOCK_INGEST_TOKEN;
  if (!expected) {
    return res
      .status(500)
      .json({ message: "STOCK_INGEST_TOKEN не настроен на сервере" });
  }

  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = bearer || req.headers["x-ingest-token"];

  if (!token || token !== expected) {
    return res.status(401).json({ message: "Неверный токен выгрузки" });
  }
  next();
};
