import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";

if (!process.env.MONGO_URI) throw new Error("Missing MONGO_URI environment variable");

const createClient = () =>
  new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000, maxPoolSize: 5 });

// A live binding: if a connection attempt fails, it is replaced with a fresh client.
// A failed MongoClient is closed for good ("Topology is closed"), which on a
// serverless host would otherwise break every later request on that instance.
export let client = createClient();
let connecting = null;

// Uses the database named in MONGO_URI.
export const studios = () => client.db().collection("studios");
export const bookings = () => client.db().collection("bookings");

/** Returns an ObjectId, or null when the string isn't a valid 24-char hex id. */
export function toObjectId(id) {
  return /^[a-f\d]{24}$/i.test(String(id)) ? new ObjectId(String(id)) : null;
}

/** Connects once and shares the attempt. After a failure, the next call starts over. */
export function connectToMongoDB() {
  if (!connecting) {
    const attempt = client.connect().then(() => {
      console.log("You successfully connected to MongoDB!");
      return client;
    });
    connecting = attempt;
    // Registered before any caller's handler, so the reset below always runs first.
    attempt.catch(async (err) => {
      console.error("MongoDB connection failed:", err.message);
      connecting = null;
      const failed = client;
      client = createClient();
      await failed.close().catch(() => {});
    });
  }
  return connecting;
}