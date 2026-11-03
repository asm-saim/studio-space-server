import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectToMongoDB } from "./db.js";
import studiosRouter from "./routes/studios.js";
import bookingsRouter from "./routes/bookings.js";

const PORT = process.env.PORT ?? 5000;

const app = express();

//middleware:
app.use(cors());
app.use(express.json());

//1st api:
app.get("/", (req, res) => {
  res.send("Hello from server");
});

app.use("/studios", studiosRouter);
app.use("/bookings", bookingsRouter);

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Something went wrong" });
});

connectToMongoDB();

//create server (locally only: on Vercel the exported app below is the entry point):
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
