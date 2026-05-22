import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Settings from "../models/Settings.js";
import { authMiddleware } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// GET /api/settings/:key — публичный
router.get("/:key", async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: req.params.key });
    res.json({ key: req.params.key, value: setting?.value || "" });
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

// PUT /api/settings/:key — обновить текстовое значение
router.put("/:key", authMiddleware, async (req, res) => {
  try {
    const { value } = req.body;
    const setting = await Settings.findOneAndUpdate(
      { key: req.params.key },
      { value },
      { new: true, upsert: true }
    );
    res.json(setting);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Ошибка сохранения", error: error.message });
  }
});

// POST /api/settings/banner/upload — загрузить фото баннера
router.post(
  "/banner/upload",
  authMiddleware,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ message: "Файл не загружен" });

      const imageUrl = `/uploads/${req.file.filename}`;

      const old = await Settings.findOne({ key: "banner_url" });
      if (
        old?.value &&
        old.value.startsWith("/uploads/") &&
        old.value !== "/uploads/banner.jpg"
      ) {
        const oldPath = path.join(
          __dirname,
          "../../",
          old.value.replace("/uploads/", "uploads/")
        );
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      const setting = await Settings.findOneAndUpdate(
        { key: "banner_url" },
        { value: imageUrl },
        { new: true, upsert: true }
      );
      res.json(setting);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Ошибка загрузки", error: error.message });
    }
  }
);

export default router;
