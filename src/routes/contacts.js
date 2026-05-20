import express from "express";
import Contact from "../models/Contact.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

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
