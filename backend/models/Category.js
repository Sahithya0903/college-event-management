const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Category name is required'], unique: true, trim: true, maxlength: 40 },
    slug: { type: String, unique: true, lowercase: true },
    icon: { type: String, default: '🎫' },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

categorySchema.pre('validate', function makeSlug(next) {
  if (this.name) this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  next();
});

module.exports = mongoose.model('Category', categorySchema);
