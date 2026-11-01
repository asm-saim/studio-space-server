import { Router } from "express";
import { bookings, studios, toObjectId } from "../db.js";
import { requireUser } from "../middleware/auth.js";

const router = Router();

function toMinutes(time) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(time ?? ""));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

const serialize = (b) => ({
  id: b._id.toString(),
  studioId: b.studioId,
  studioTitle: b.studioTitle,
  studioImage: b.studioImage,
  studioLocation: b.studioLocation,
  date: b.date,
  startTime: b.startTime,
  endTime: b.endTime,
  hours: b.hours,
  guests: b.guests,
  notes: b.notes ?? "",
  hourlyRate: b.hourlyRate,
  totalPrice: b.totalPrice,
  securityDeposit: b.securityDeposit,
  status: b.status,
  createdAt: b.createdAt,
});

// POST /bookings  { studioId, date: "YYYY-MM-DD", startTime: "HH:mm", endTime, guests, notes }
router.post("/", requireUser, async (req, res) => {
  const { studioId, date, startTime, endTime, notes } = req.body ?? {};
  const guests = Number(req.body?.guests);

  const _id = toObjectId(studioId);
  const studio = _id && (await studios().findOne({ _id }));
  if (!studio) return res.status(404).json({ message: "Studio not found" });
  if (studio.ownerEmail === req.user.email) {
    return res.status(400).json({ message: "You can't book your own studio." });
  }

  // Allow yesterday (UTC) so users in far-west timezones aren't rejected for "today".
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || Number.isNaN(Date.parse(date)) || date < yesterday) {
    return res.status(400).json({ message: "Choose a valid upcoming date." });
  }

  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  if (startMin === null || endMin === null || endMin - startMin < 60) {
    return res.status(400).json({ message: "Bookings must be at least 1 hour long." });
  }
  if (!Number.isInteger(guests) || guests < 1 || guests > studio.maxCapacity) {
    return res.status(400).json({ message: `Guests must be between 1 and ${studio.maxCapacity}.` });
  }

  // Double-booking guard: reject overlaps with Confirmed bookings on the same day.
  const clash = await bookings().findOne({
    studioId: String(_id),
    date,
    status: "Confirmed",
    startMin: { $lt: endMin },
    endMin: { $gt: startMin },
  });
  if (clash) {
    return res.status(409).json({ message: "That time slot is already booked. Pick another time." });
  }

  const hours = (endMin - startMin) / 60;
  const { insertedId } = await bookings().insertOne({
    studioId: String(_id),
    studioTitle: studio.title,
    studioImage: studio.image ?? studio.images?.[0] ?? "",
    studioLocation: studio.location ?? "",
    ownerEmail: studio.ownerEmail,
    userEmail: req.user.email,
    userName: req.user.name,
    date,
    startTime,
    endTime,
    startMin,
    endMin,
    hours,
    guests,
    notes: typeof notes === "string" ? notes.trim().slice(0, 500) : "",
    hourlyRate: studio.hourlyRate,
    totalPrice: Math.round(studio.hourlyRate * hours * 100) / 100,
    securityDeposit: studio.securityDeposit ?? 0,
    status: "Pending",
    createdAt: new Date(),
  });
  res.status(201).json({ id: insertedId.toString() });
});

router.get("/mine", requireUser, async (req, res) => {
  const docs = await bookings().find({ userEmail: req.user.email }).sort({ createdAt: -1 }).toArray();
  res.json(docs.map(serialize));
});

router.patch("/:id/cancel", requireUser, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const booking = _id && (await bookings().findOne({ _id }));
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (booking.userEmail !== req.user.email) {
    return res.status(403).json({ message: "You can only cancel your own bookings." });
  }
  if (booking.status !== "Pending") {
    return res.status(409).json({ message: "Only pending bookings can be cancelled." });
  }

  await bookings().updateOne({ _id }, { $set: { status: "Cancelled", cancelledAt: new Date() } });
  res.json({ id: req.params.id, status: "Cancelled" });
});

export default router;
