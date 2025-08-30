const express = require("express");
const cors = require("cors");
const router = require("./router");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Test route
app.get("/", (req, res) => res.send("Backend is running..."));

module.exports = app;
