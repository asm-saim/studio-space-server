import express from "express";
import cors from "cors";

const PORT = 5000;

const app = express();

//middleware:
app.use(cors());
app.use(express.json());

//1st api:
app.get("/", (req, res) => {
  res.send("Hello from server");
});

//create server:
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
