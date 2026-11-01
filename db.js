import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";

export const client = new MongoClient(process.env.MONGO_URI);

// Uses the database named in MONGO_URI.
export const studios = () => client.db().collection("studios");
export const bookings = () => client.db().collection("bookings");

/** Returns an ObjectId, or null when the string isn't a valid 24-char hex id. */
export function toObjectId(id) {
  return /^[a-f\d]{24}$/i.test(String(id)) ? new ObjectId(String(id)) : null;
}

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}