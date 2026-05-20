import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    phone: { type: String, default: "" },
    phone2: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    workingHours: { type: String, default: "" },
    telegram: { type: String, default: "" },
    whatsapp: { type: String, default: "" },
    max: { type: String, default: "" },
    instagram: { type: String, default: "" },
    mapLat: { type: Number, default: null },
    mapLng: { type: Number, default: null },
    mapLink: { type: String, default: null },
    mapFrameLink: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Contact", contactSchema);
