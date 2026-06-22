require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");

const app = express();
const port = process.env.PORT || 3001;
const mongoUri = process.env.MONGODB_URI;

if (mongoUri) {
  mongoose
    .connect(mongoUri)
    .then(() => console.log("Monitoring connected to MongoDB"))
    .catch((err) => console.error("MongoDB connection error:", err.message));
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "monitoring" });
});

app.listen(port, () => {
  console.log(`Monitoring service running on ${port}`);
});
