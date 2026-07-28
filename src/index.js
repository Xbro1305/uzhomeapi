import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import fabricRoutes from "./routes/fabrics.js";
import contactRoutes from "./routes/contacts.js";
import certificateRoutes from "./routes/certificates.js";
import settingsRoutes from "./routes/settings.js";
import stockRoutes from "./routes/stock.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

//allow CORS for frontend from any origin (for development, in production specify the frontend URL)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/fabrics", fabricRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/stock", stockRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "УЗ Хоме API работает" });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB подключена");
    app.listen(PORT, () => {
      console.log(`🚀 Сервер запущен на порту ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Ошибка подключения к MongoDB:", err.message);
    process.exit(1);
  });
