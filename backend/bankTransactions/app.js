// app.js
const express = require("express");
const cors = require("cors");
const router = require("./router");

const app = express();

app.use(cors({
  origin: ["http://localhost:3000","http://127.0.0.1:3000"], // add your frontend origin(s)
  credentials: true
}));

app.use(express.json());
app.use("/api", router);
module.exports = app;