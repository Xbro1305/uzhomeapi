import mongoose from "mongoose";

const colorVariantSchema = new mongoose.Schema({
  article: { type: String, default: "", trim: true },
  name: { type: String, default: "", trim: true },
  order: { type: Number, default: 0, trim: true },
  imageUrl: { type: String, default: "", required: false },
});

const fabricSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    composition: { type: String, default: "" },
    width: { type: String, default: "" },
    density: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    priceUnit: { type: String, default: "за метр" },
    currency: { type: String, default: "сум" },
    colors: [colorVariantSchema],
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Fabric", fabricSchema);
