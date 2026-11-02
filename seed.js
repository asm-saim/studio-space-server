// Inserts demo studios. Run: npm run seed   (add --reset to wipe the studios collection first)
// Images are hotlinked from the Pexels CDN (see px()). Keep them https:// — the
// studio edit form rejects non-https image URLs.
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
  ["Sunroom Photo Studio", "photo-studios", 50, [5, 5, 4], "San Francisco, CA"],
  ["Harbor Sound Stage", "sound-stages", 120, [5, 5], "Los Angeles, CA"],
  ["Backlot Stage B", "sound-stages", 150, [4, 5], "Atlanta, GA"],
  ["Stage 12 Production Hall", "sound-stages", 140, [5, 4, 5], "Albuquerque, NM"],
  ["The Quiet Booth", "podcast-rooms", 35, [5, 5, 5], "Chicago, IL"],
  ["Two Mic Studio", "podcast-rooms", 28, [4, 5], "Seattle, WA"],
  ["Vinyl Room Suite", "music-suites", 55, [5, 4, 5], "Nashville, TN"],
  ["Harmony Recording Suite", "music-suites", 65, [5, 5, 4], "Memphis, TN"],
  ["Clay & Canvas Workshop", "art-workshops", 30, [4, 4], "Portland, OR"],
  ["Makers Loft Workshop", "art-workshops", 35, [5, 4], "Asheville, NC"],
];

/** Pexels CDN URL for a photo id, cropped to the 1200x800 (3:2) used everywhere. */
const px = (id) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop`;

// Cover + gallery photo ids per studio slug. Every id was checked to return 200
// and to visually match the listing's category and blurb.
const IMAGES = {
  "northlight-photo-loft": [4268512, 6045296, 40137089],
  "cyclorama-one": [39232446, 6989087, 12616007],
  "sunroom-photo-studio": [16008692, 16495457, 30173137],
  "harbor-sound-stage": [8089249, 8089662, 19102538],
  "backlot-stage-b": [31329890, 8089653, 34007217],
  "stage-12-production-hall": [38059004, 38492070, 7709691],
  "the-quiet-booth": [38578266, 37355068, 37033739],
  "two-mic-studio": [38493054, 27357324, 37033702],
  "vinyl-room-suite": [7586136, 14828524, 34516678],
  "harmony-recording-suite": [8132964, 19452351, 18466433],
  "clay-canvas-workshop": [34059831, 40471871, 30225310],
  "makers-loft-workshop": [5682330, 34059836, 37042751],
};

const studios = rows.map(([title, category, hourlyRate, ratings, location], i) => {
  const c = BY_CATEGORY[category];
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const images = IMAGES[slug].map(px);
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
