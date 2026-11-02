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

function formatMinutes(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/**
 * Finds a Confirmed booking for the same studio and date that overlaps
 * [startMin, endMin). Two ranges overlap when each one starts before the
 * other ends (strict $lt / $gt), so back-to-back bookings are allowed.
 */
function findConfirmedOverlap({ studioId, date, startMin, endMin, excludeId }) {
  const filter = {
    studioId,
    date,
    status: "Confirmed",
    startMin: { $lt: endMin },
    endMin: { $gt: startMin },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return bookings().findOne(filter);
}

const conflictMessage = (clash) =>
  `That time overlaps a confirmed booking (${formatMinutes(clash.startMin)} – ${formatMinutes(clash.endMin)} on ${clash.date}). Please choose a different time.`;

const serialize = (b, withGuest = false) => ({
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
  ...(withGuest ? { userName: b.userName, userEmail: b.userEmail } : {}),
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

  // Challenge 2: reject collisions with Confirmed bookings before saving.
  const clash = await findConfirmedOverlap({ studioId: String(_id), date, startMin, endMin });
  if (clash) return res.status(409).json({ message: conflictMessage(clash) });

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

// Guest view: bookings I made.
router.get("/mine", requireUser, async (req, res) => {
  const docs = await bookings().find({ userEmail: req.user.email }).sort({ createdAt: -1 }).toArray();
  res.json(docs.map((b) => serialize(b)));
});

// Host view: booking requests for studios I own (must stay above /:id routes).
router.get("/requests", requireUser, async (req, res) => {
  const docs = await bookings().find({ ownerEmail: req.user.email }).sort({ createdAt: -1 }).toArray();
  res.json(docs.map((b) => serialize(b, true)));
});

// Guest cancels their own pending booking.
router.patch("/:id/cancel", requireUser, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const booking = _id && (await bookings().findOne({ _id }));
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (booking.userEmail !== req.user.email) {
    return res.status(403).json({ message: "You can only cancel your own bookings." });
  }

  const { modifiedCount } = await bookings().updateOne(
    { _id, status: "Pending" },
    { $set: { status: "Cancelled", cancelledAt: new Date() } },
  );
  if (!modifiedCount) return res.status(409).json({ message: "Only pending bookings can be cancelled." });
  res.json({ id: req.params.id, status: "Cancelled" });
});

// Host confirms a pending request. Re-checks overlaps so a slot can never be confirmed twice.
router.patch("/:id/confirm", requireUser, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const booking = _id && (await bookings().findOne({ _id }));
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (booking.ownerEmail !== req.user.email) {
    return res.status(403).json({ message: "Only the studio host can confirm this booking." });
  }
  if (booking.status !== "Pending") {
    return res.status(409).json({ message: "Only pending bookings can be confirmed." });
  }

  const range = { studioId: booking.studioId, date: booking.date, startMin: booking.startMin, endMin: booking.endMin };

  const clash = await findConfirmedOverlap({ ...range, excludeId: _id });
  if (clash) return res.status(409).json({ message: conflictMessage(clash) });

  // The filter on status makes the Pending -> Confirmed change atomic.
  const { modifiedCount } = await bookings().updateOne(
    { _id, status: "Pending" },
    { $set: { status: "Confirmed", confirmedAt: new Date() } },
  );
  if (!modifiedCount) return res.status(409).json({ message: "This booking was already updated." });

  // Two overlapping requests confirmed at the same instant can both pass the check
  // above. Re-check after writing; the one with the larger id steps back, so only
  // one survives.
  const rival = await findConfirmedOverlap({ ...range, excludeId: _id });
  if (rival && rival._id.toString() < _id.toString()) {
    await bookings().updateOne({ _id }, { $set: { status: "Pending" }, $unset: { confirmedAt: "" } });
    return res.status(409).json({ message: conflictMessage(rival) });
  }

  res.json({ id: req.params.id, status: "Confirmed" });
});

// Host declines a pending request.
router.patch("/:id/decline", requireUser, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const booking = _id && (await bookings().findOne({ _id }));
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (booking.ownerEmail !== req.user.email) {
    return res.status(403).json({ message: "Only the studio host can decline this booking." });
  }

  const { modifiedCount } = await bookings().updateOne(
    { _id, status: "Pending" },
    { $set: { status: "Cancelled", declinedAt: new Date() } },
  );
  if (!modifiedCount) return res.status(409).json({ message: "Only pending bookings can be declined." });
  res.json({ id: req.params.id, status: "Cancelled" });
});

export default router;