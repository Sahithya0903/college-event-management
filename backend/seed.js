/**
 * One-time / repeatable seed script.
 * Usage: npm run seed
 * Creates an admin, an organizer, a demo user, default categories, a venue and one sample event.
 * Safe to re-run: it skips anything that already exists.
 */
require('dotenv').config();
const connectDB = require('./config/db');
const User = require('./models/User');
const Category = require('./models/Category');
const Venue = require('./models/Venue');
const Event = require('./models/Event');

const CATEGORIES = [
  { name: 'Academic', icon: '🎓' },
  { name: 'Technology', icon: '💻' },
  { name: 'Music', icon: '🎵' },
  { name: 'Cultural', icon: '🎨' },
  { name: 'Sports', icon: '🏆' },
  { name: 'Business', icon: '💼' },
  { name: 'Startup', icon: '🚀' },
  { name: 'Conferences', icon: '🎤' },
  { name: 'Workshops', icon: '📚' },
  { name: 'Festivals', icon: '🎉' },
];

async function upsertUser(data) {
  let user = await User.findOne({ email: data.email });
  if (!user) {
    user = await User.create(data);
    console.log(`Created ${data.role}: ${data.email} / ${data.password}`);
  } else {
    console.log(`Already exists: ${data.email}`);
  }
  return user;
}

(async () => {
  await connectDB();

  const admin = await upsertUser({ name: 'Admin', email: 'admin@evently.test', password: 'Admin@12345', role: 'admin' });
  const organizer = await upsertUser({ name: 'Solete Events Team', email: 'organizer@evently.test', password: 'Organizer@123', role: 'organizer' });
  await upsertUser({ name: 'Demo User', email: 'user@evently.test', password: 'User@12345', role: 'user' });

  // Self-heal: an earlier bug in this script (findOneAndUpdate+upsert skips the slug-generation hook)
  // could have left a category with slug: null. Fix any such record before inserting new ones.
  const broken = await Category.find({ $or: [{ slug: null }, { slug: { $exists: false } }] });
  for (const doc of broken) {
    await doc.save(); // triggers the pre('validate') hook, which derives slug from name
  }
  if (broken.length) console.log(`Fixed ${broken.length} category record(s) with a missing slug`);

  for (const c of CATEGORIES) {
    const exists = await Category.findOne({ name: c.name });
    if (!exists) await Category.create(c); // .create() runs the pre('validate') hook that sets slug
  }
  console.log(`Categories ready (${CATEGORIES.length})`);

  let venue = await Venue.findOne({ name: 'College Auditorium', city: 'Vijayawada' });
  if (!venue) {
    venue = await Venue.create({ name: 'College Auditorium', city: 'Vijayawada', address: 'MG Road', capacity: 300, createdBy: admin._id });
    console.log('Created venue: College Auditorium');
  }

  const techCategory = await Category.findOne({ name: 'Technology' });
  const existingEvent = await Event.findOne({ title: 'Tech Innovation Summit' });
  if (!existingEvent) {
    const start = new Date();
    start.setDate(start.getDate() + 14);
    const startDate = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
    const deadline = new Date(startDate);
    deadline.setUTCDate(deadline.getUTCDate() - 2);

    await Event.create({
      title: 'Tech Innovation Summit',
      description: 'A technology conference featuring talks on AI, cloud computing and startups, with networking sessions and hands-on workshops.',
      category: techCategory._id,
      startDate,
      endDate: startDate,
      startTime: '10:00',
      endTime: '17:00',
      venue: venue.name,
      location: 'Vijayawada',
      fee: 500,
      capacity: 200,
      registrationDeadline: deadline,
      status: 'published',
      organizerId: organizer._id,
      organizerName: organizer.name,
      contactEmail: organizer.email,
      highlights: ['Technical Sessions', 'Expert Speakers', 'Networking', 'Certificates'],
      schedule: [
        { time: '10:00', title: 'Registration & Welcome' },
        { time: '11:00', title: 'Keynote: The Future of AI' },
        { time: '13:00', title: 'Lunch & Networking' },
        { time: '14:00', title: 'Workshops' },
        { time: '16:30', title: 'Closing Remarks' },
      ],
    });
    console.log('Created sample event: Tech Innovation Summit');
  }

  console.log('\nSeed complete. Sign in with:');
  console.log('  Admin:     admin@evently.test / Admin@12345');
  console.log('  Organizer: organizer@evently.test / Organizer@123');
  console.log('  User:      user@evently.test / User@12345');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
