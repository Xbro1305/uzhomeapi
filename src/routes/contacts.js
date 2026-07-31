import express from "express";
import Contact from "../models/Contact.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendTelegram, formatContactMessage } from "../utils/telegram.js";

const router = express.Router();

// POST /api/contacts/message — заявка с формы обращения → Telegram (без логина)
router.post("/message", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const email = String(req.body?.email || "").trim();
    const message = String(req.body?.message || "").trim();

    if (!name || !phone) {
      return res.status(400).json({ message: "Укажите имя и телефон" });
    }
    const tg = await sendTelegram(
      formatContactMessage({ name, phone, email, message })
    );
    if (!tg.ok && tg.reason === "not_configured") {
      return res
        .status(500)
        .json({ message: "Отправка не настроена на сервере" });
    }
    res.status(201).json({ message: "Заявка принята" });
  } catch (error) {
    res.status(500).json({ message: "Ошибка отправки", error: error.message });
  }
});

// GET /api/contacts — публичный
router.get("/", async (req, res) => {
  try {
    let contact = await Contact.findOne();
    if (!contact) {
      contact = new Contact({
        phone: "",
        email: "",
        address: "",
        workingHours: "",
      });
      await contact.save();
    }
    res.json(contact);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

// PUT /api/contacts — обновить контакты (только для админа)
router.put("/", authMiddleware, async (req, res) => {
  try {
    const {
      phone,
      phone2,
      email,
      address,
      workingHours,
      telegram,
      whatsapp,
      max,
      instagram,
      mapLat,
      mapLng,
      mapLink,
      mapFrameLink,
    } = req.body;
    let contact = await Contact.findOne();
    if (!contact) {
      contact = new Contact({});
    }
    Object.assign(contact, {
      phone,
      phone2,
      email,
      address,
      workingHours,
      telegram,
      whatsapp,
      instagram,
      mapLat,
      mapLng,
      max,
      mapLink,
      mapFrameLink,
    });
    await contact.save();
    res.json(contact);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Ошибка обновления", error: error.message });
  }
});

export default router;
