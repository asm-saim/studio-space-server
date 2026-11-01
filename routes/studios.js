import { Router } from "express";
import { studios, toObjectId } from "../db.js";
import { requireUser } from "../middleware/auth.js";

const router = Router();

const CATEGORIES = ["photo-studios", "sound-stages", "podcast-rooms", "music-suites", "art-workshops"];

const SORTS = {
  rating: { rating: -1, createdAt: -1 },
  newest: { createdAt: -1 },
  "price-low": { hourlyRate: 1 },
  "price-high": { hourlyRate: -1 },
};

const summary = (d) => ({
  id: d._id.toString(),
  title: d.title,
  category: d.category,
  image: d.image ?? d.images?.[0] ?? "",
  hourlyRate: d.hourlyRate ?? 0,
  rating: d.rating ?? 0,
  reviewCount: d.reviewCount ?? d.reviews?.length ?? 0,
  location: d.location ?? "",
});

const detail = (d) => ({
  ...summary(d),
  images: d.images?.length ? d.images : [d.image].filter(Boolean),
  securityDeposit: d.securityDeposit ?? 0,
  maxCapacity: d.maxCapacity ?? 1,
  amenities: d.amenities ?? [],
  overview: d.overview ?? "",
  ownerName: d.ownerName ?? "",
  ownerEmail: d.ownerEmail ?? "",
  ownerImage: d.ownerImage,
  reviews: d.reviews ?? [],
  createdAt: d.createdAt,
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parseStudio(body = {}) {
  const errors = {};
  const text = (v) => (typeof v === "string" ? v.trim() : "");
  const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));

  const title = text(body.title);
  const category = text(body.category);
  const location = text(body.location);
  const overview = text(body.overview);
  const image = text(body.image);
  const hourlyRate = num(body.hourlyRate);
  const securityDeposit = num(body.securityDeposit ?? 0);
  const maxCapacity = num(body.maxCapacity);
  const extraImages = Array.isArray(body.images) ? body.images.map(text).filter(Boolean) : [];
  const amenities = Array.isArray(body.amenities)
    ? [...new Set(body.amenities.map(text).filter(Boolean))]
    : [];

  if (title.length < 3 || title.length > 100) errors.title = "Title must be 3–100 characters.";
  if (!CATEGORIES.includes(category)) errors.category = "Choose a valid category.";
  if (!(hourlyRate > 0)) errors.hourlyRate = "Hourly rate must be above $0.";
  if (!(securityDeposit >= 0)) errors.securityDeposit = "Deposit can't be negative.";
  if (!Number.isInteger(maxCapacity) || maxCapacity < 1) errors.maxCapacity = "Capacity must be a whole number of at least 1.";
  if (location.length < 3) errors.location = "Enter the studio address.";
  if (!isHttpsUrl(image)) errors.image = "Cover image must be an https:// URL.";
  if (extraImages.length > 4 || extraImages.some((u) => !isHttpsUrl(u))) {
    errors.images = "Add up to 4 extra images, each an https:// URL.";
  }
  if (overview.length < 20) errors.overview = "Write at least 20 characters about the space.";
  if (amenities.length > 30 || amenities.some((a) => a.length > 40)) {
    errors.amenities = "Up to 30 amenities, 40 characters each.";
  }

  const data = {
    title,
    category,
    hourlyRate,
    securityDeposit,
    maxCapacity,
    location,
    image,
    images: [image, ...extraImages.filter((u) => u !== image)],
    amenities,
    overview,
  };
  return { errors, data };
}

// GET /studios?category=&q=&sort=rating|newest|price-low|price-high&limit=
router.get("/", async (req, res) => {
  const { category, q, sort = "rating" } = req.query;
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 60, 1), 100);

  const filter = {};
  if (typeof category === "string" && CATEGORIES.includes(category)) filter.category = category;
  if (typeof q === "string" && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim().slice(0, 60)), "i");
    filter.$or = [{ title: rx }, { location: rx }];
  }

  const docs = await studios()
    .find(filter)
    .sort(SORTS[sort] ?? SORTS.rating)
    .limit(limit)
    .toArray();
  res.json(docs.map(summary));
});

// GET /studios/mine (must stay above /:id)
router.get("/mine", requireUser, async (req, res) => {
  const docs = await studios().find({ ownerEmail: req.user.email }).sort({ createdAt: -1 }).toArray();
  res.json(docs.map(summary));
});

router.get("/:id", async (req, res) => {
  const _id = toObjectId(req.params.id);
  const doc = _id && (await studios().findOne({ _id }));
  if (!doc) return res.status(404).json({ message: "Studio not found" });
  res.json(detail(doc));
});

router.post("/", requireUser, async (req, res) => {
  const { errors, data } = parseStudio(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: "Please fix the highlighted fields.", errors });
  }

  const now = new Date();
  const { insertedId } = await studios().insertOne({
    ...data,
    ownerEmail: req.user.email, // taken from the verified session, never from the body
    ownerName: req.user.name,
    ownerImage: req.user.image,
    rating: 0,
    reviewCount: 0,
    reviews: [],
    createdAt: now,
    updatedAt: now,
  });
  res.status(201).json({ id: insertedId.toString() });
});

router.put("/:id", requireUser, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const existing = _id && (await studios().findOne({ _id }));
  if (!existing) return res.status(404).json({ message: "Studio not found" });
  if (existing.ownerEmail !== req.user.email) {
    return res.status(403).json({ message: "You can only edit your own listings." });
  }

  const { errors, data } = parseStudio(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: "Please fix the highlighted fields.", errors });
  }

  await studios().updateOne({ _id }, { $set: { ...data, updatedAt: new Date() } });
  res.json({ id: req.params.id });
});

router.delete("/:id", requireUser, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const existing = _id && (await studios().findOne({ _id }));
  if (!existing) return res.status(404).json({ message: "Studio not found" });
  if (existing.ownerEmail !== req.user.email) {
    return res.status(403).json({ message: "You can only delete your own listings." });
  }

  await studios().deleteOne({ _id });
  res.json({ id: req.params.id });
});

export default router;