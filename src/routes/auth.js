import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Введите логин и пароль' });
    }

    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    const adminPasswordPlain = process.env.ADMIN_PASSWORD || 'admin123';

    if (username !== adminUsername) {
      return res.status(401).json({ message: 'Неверный логин или пароль' });
    }

    let isValid = false;
    if (adminPasswordHash) {
      isValid = await bcrypt.compare(password, adminPasswordHash);
    } else {
      isValid = password === adminPasswordPlain;
    }

    if (!isValid) {
      return res.status(401).json({ message: 'Неверный логин или пароль' });
    }

    const token = jwt.sign(
      { username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, message: 'Успешный вход' });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка сервера', error: error.message });
  }
});

// GET /api/auth/verify
router.get('/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, admin: req.admin });
});

// POST /api/auth/hash-password (утилита для генерации хэша)
router.post('/hash-password', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ message: 'Введите пароль' });
  const hash = await bcrypt.hash(password, 12);
  res.json({ hash });
});

export default router;
