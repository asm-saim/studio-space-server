// Inserts demo studios. Run: npm run seed   (add --reset to wipe the studios collection first)
// Images are picsum.photos placeholders: replace them with real ones later.
import { MongoClient } from "mongodb";
import "dotenv/config";

const BY_CATEGORY = {
  "photo-studios": {
    amenities: ["Natural light", "Backdrop paper", "Lighting kit", "Wi-Fi", "Changing room"],
    capacity: 12,
    deposit: 100,
    blurb: "a bright shooting space with a clean white cyclorama and room for a full crew.",
  },
  "sound-stages": {
    amenities: ["Soundproofing", "Green screen", "Lighting kit", "Parking", "Air conditioning"],
    capacity: 40,
    deposit: 300,
    blurb: "a large soundproofed stage with a grid, loading access, and space for sets.",
  },
  "podcast-rooms": {
    amenities: ["Mic & monitors", "Soundproofing", "Wi-Fi", "Air conditioning"],
    capacity: 5,
    deposit: 50,
    blurb: "an acoustically treated room with broadcast mics and headphones ready to go.",
  },
  "music-suites": {
    amenities: ["Mixing console", "Mic & monitors", "Instruments", "Soundproofing", "Wi-Fi"],
    capacity: 8,
    deposit: 120,
    blurb: "a rehearsal and recording suite with a live room, a control room, and backline gear.",
  },
  "art-workshops": {
    amenities: ["Natural light", "Kitchenette", "Restroom", "Wi-Fi"],
    capacity: 20,
    deposit: 80,
    blurb: "an open workshop with large tables, sinks, and storage for messy creative work.",
  },
};

const REVIEW_POOL = [
  ["Maya R.", "Easy to find, spotless, and the host had everything set up before we arrived."],
  ["Daniel K.", "Exactly as pictured. We finished our shoot early and the space was great to work in."],
  ["Priya S.", "Great value for the hour. Communication was quick and check-in was simple."],
  ["Tom W.", "Quiet, comfortable, and well equipped. I'll be booking again next month."],
];

const rows = [
  ["Northlight Photo Loft", "photo-studios", 45, [5, 5, 4], "Brooklyn, NY"],
  ["Cyclorama One", "photo-studios", 60, [5, 4], "Austin, TX"],
  ["Harbor Sound Stage", "sound-stages", 120, [5, 5], "Los Angeles, CA"],
  ["Backlot Stage B", "sound-stages", 150, [4, 5], "Atlanta, GA"],
  ["The Quiet Booth", "podcast-rooms", 35, [5, 5, 5], "Chicago, IL"],
  ["Two Mic Studio", "podcast-rooms", 28, [4, 5], "Seattle, WA"],
  ["Vinyl Room Suite", "music-suites", 55, [5, 4, 5], "Nashville, TN"],
  ["Clay & Canvas Workshop", "art-workshops", 30, [4, 4], "Portland, OR"],
];

const studios = rows.map(([title, category, hourlyRate, ratings, location], i) => {
  const c = BY_CATEGORY[category];
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const images = [1, 2, 3].map((n) => `https://picsum.photos/seed/${slug}-${n}/1200/800`);
  const reviews = ratings.map((rating, n) => {
    const [author, comment] = REVIEW_POOL[(i + n) % REVIEW_POOL.length];
    return { author, rating, comment, createdAt: new Date(Date.now() - (n + 1) * 9 * 86_400_000) };
  });
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;

  return {
    title,
    category,
    hourlyRate,
    securityDeposit: c.deposit,
    maxCapacity: c.capacity,
    location,
    image: images[0],
    images,
    amenities: c.amenities,
    overview: `${title} is ${c.blurb} It sits in ${location} and is booked by the hour, so you can arrive, set up, and start creating without any extra arrangements.`,
    ownerName: "StudioSpace Host",
    ownerEmail: "host@studiospace.demo",
    rating: Math.round(avg * 10) / 10,
    reviewCount: reviews.length,
    reviews,
    createdAt: new Date(Date.now() - i * 86_400_000),
    updatedAt: new Date(),
  };
});

const client = new MongoClient(process.env.MONGO_URI);
try {
  await client.connect();
  const col = client.db().collection("studios");
  if (process.argv.includes("--reset")) {
    const { deletedCount } = await col.deleteMany({});
    console.log(`Removed ${deletedCount} existing studios.`);
  }
  if ((await col.countDocuments()) > 0) {
    console.log("studios collection already has data, skipping seed. Use --reset to replace it.");
  } else {
    const { insertedCount } = await col.insertMany(studios);
    console.log(`Inserted ${insertedCount} studios.`);
  }
} finally {
  await client.close();
}
