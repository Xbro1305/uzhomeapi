import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Certificate from '../models/Certificate.js';
import { authMiddleware } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// GET /api/certificates — публичный
router.get('/', async (req, res) => {
  try {
    const certs = await Certificate.find().sort({ order: 1, createdAt: 1 });
    res.json(certs);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка сервера', error: error.message });
  }
});

// POST /api/certificates
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Изображение обязательно' });
    const { title, description, issuedBy, year, order } = req.body;
    const cert = new Certificate({
      title,
      description,
      issuedBy,
      year,
      order: Number(order) || 0,
      imageUrl: `/uploads/${req.file.filename}`,
    });
    await cert.save();
    res.status(201).json(cert);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка создания', error: error.message });
  }
});

// PUT /api/certificates/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description, issuedBy, year, order } = req.body;
    const cert = await Certificate.findByIdAndUpdate(
      req.params.id,
      { title, description, issuedBy, year, order: Number(order) || 0 },
      { new: true }
    );
    if (!cert) return res.status(404).json({ message: 'Сертификат не найден' });
    res.json(cert);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка обновления', error: error.message });
  }
});

// DELETE /api/certificates/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const cert = await Certificate.findByIdAndDelete(req.params.id);
    if (!cert) return res.status(404).json({ message: 'Сертификат не найден' });
    if (cert.imageUrl) {
      const filePath = path.join(__dirname, '../../', cert.imageUrl.replace('/uploads/', 'uploads/'));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    res.json({ message: 'Сертификат удалён' });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка удаления', error: error.message });
  }
});

export default router;
