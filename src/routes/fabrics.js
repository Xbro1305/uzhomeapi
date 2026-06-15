router.delete("/:id/colors/:colorId", authMiddleware, async (req, res) => {
  try {
    const fabric = await Fabric.findById(req.params.id);
    if (!fabric) return res.status(404).json({ message: "Ткань не найдена" });

    const color = fabric.colors.id(req.params.colorId);
    if (!color)
      return res.status(404).json({ message: "Расцветка не найдена" });

    // удаляем файл, если он есть
    if (color.imageUrl) {
      const filePath = path.join(
        __dirname,
        "../../",
        color.imageUrl.replace("/uploads/", "uploads/")
      );
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    // атомарное удаление — не валидирует остальные расцветки
    const updated = await Fabric.findByIdAndUpdate(
      req.params.id,
      { $pull: { colors: { _id: req.params.colorId } } },
      { new: true, runValidators: false }
    );

    res.json(updated);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Ошибка удаления расцветки", error: error.message });
  }
});
