const Category = require('../models/Category');
const Event = require('../models/Event');
const { HttpError, asyncHandler } = require('../middleware/error');

const pick = (b) => ({
  name: typeof b.name === 'string' ? b.name.trim() : undefined,
  icon: typeof b.icon === 'string' && b.icon.trim() ? b.icon.trim() : undefined,
  description: typeof b.description === 'string' ? b.description.trim() : undefined,
});

exports.list = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort('name');
  res.json({ success: true, categories });
});

exports.create = asyncHandler(async (req, res) => {
  const data = pick(req.body);
  if (!data.name) throw new HttpError(400, 'Enter a category name');
  const category = await Category.create(data);
  res.status(201).json({ success: true, category });
});

exports.update = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new HttpError(404, 'Category not found');
  const data = pick(req.body);
  Object.keys(data).forEach((k) => data[k] !== undefined && (category[k] = data[k]));
  await category.save();
  res.json({ success: true, category });
});

exports.remove = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new HttpError(404, 'Category not found');
  const used = await Event.countDocuments({ category: category._id });
  if (used) throw new HttpError(409, `${used} event(s) use this category. Move them to another category first`);
  await category.deleteOne();
  res.json({ success: true, message: 'Category deleted' });
});
