import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Fabric from "../models/Fabric.js";
import { authMiddleware } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// GET /api/fabrics — публичный список активных тканей
router.get("/", async (req, res) => {
  try {
    const fabrics = await Fabric.find({ isActive: true }).sort({
      order: 1,
      createdAt: 1,
    });
    res.json(fabrics);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

// GET /api/fabrics/admin — все ткани для админки
router.get("/admin", authMiddleware, async (req, res) => {
  try {
    const fabrics = await Fabric.find().sort({ order: 1, createdAt: 1 });
    res.json(fabrics);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

// GET /api/fabrics/:id
router.get("/:id", async (req, res) => {
  try {
    const fabric = await Fabric.findById(req.params.id);
    if (!fabric) return res.status(404).json({ message: "Ткань не найдена" });
    res.json(fabric);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

// POST /api/fabrics — создать ткань
router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      name,
      description,
      composition,
      width,
      density,
      price,
      priceUnit,
      currency,
      isActive,
      order,
    } = req.body;
    const fabric = new Fabric({
      name,
      description,
      composition,
      width,
      density,
      price: Number(price),
      priceUnit,
      currency,
      isActive,
      order: Number(order) || 0,
      colors: [],
    });
    await fabric.save();
    res.status(201).json(fabric);
  } catch (error) {
    res.status(500).json({ message: "Ошибка создания", error: error.message });
  }
});

// PUT /api/fabrics/:id — обновить ткань
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const {
      name,
      description,
      composition,
      width,
      density,
      price,
      priceUnit,
      currency,
      isActive,
      order,
    } = req.body;
    const fabric = await Fabric.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description,
        composition,
        width,
        density,
        price: Number(price),
        priceUnit,
        currency,
        isActive,
        order: Number(order) || 0,
      },
      { new: true, runValidators: true }
    );
    if (!fabric) return res.status(404).json({ message: "Ткань не найдена" });
    res.json(fabric);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Ошибка обновления", error: error.message });
  }
});

// DELETE /api/fabrics/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const fabric = await Fabric.findByIdAndDelete(req.params.id);
    if (!fabric) return res.status(404).json({ message: "Ткань не найдена" });
    // Удаляем файлы изображений
    fabric.colors.forEach((color) => {
      if (color.imageUrl) {
        const filePath = path.join(
          __dirname,
          "../../",
          color.imageUrl.replace("/uploads/", "uploads/")
        );
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    });
    res.json({ message: "Ткань удалена" });
  } catch (error) {
    res.status(500).json({ message: "Ошибка удаления", error: error.message });
  }
});

// POST /api/fabrics/:id/colors — добавить расцветку с фото
router.post(
  "/:id/colors",
  authMiddleware,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ message: "Изображение обязательно" });

      const { name, article } = req.body;
      const imageUrl = `/uploads/${req.file.filename}`;

      const fabric = await Fabric.findByIdAndUpdate(
        req.params.id,
        {
          $push: {
            colors: { article: article || "", name: name || "", imageUrl },
          },
        },
        { new: true, runValidators: false }
      );
      if (!fabric) return res.status(404).json({ message: "Ткань не найдена" });
      res.json(fabric);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Ошибка добавления расцветки", error: error.message });
    }
  }
);

// DELETE /api/fabrics/:id/colors/:colorId — удалить расцветку
router.delete("/:id/colors/:colorId", authMiddleware, async (req, res) => {
  try {
    const fabric = await Fabric.findById(req.params.id);
    if (!fabric) return res.status(404).json({ message: "Ткань не найдена" });

    const color = fabric.colors.id(req.params.colorId);
    if (!color)
      return res.status(404).json({ message: "Расцветка не найдена" });

    // Удаляем файл
    if (color.imageUrl) {
      const filePath = path.join(
        __dirname,
        "../../",
        color.imageUrl.replace("/uploads/", "uploads/")
      );
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    fabric.colors.pull(req.params.colorId);
    await fabric.save();
    res.json(fabric);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Ошибка удаления расцветки", error: error.message });
  }
});

export default router;
