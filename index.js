const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 8000;

// middleware
app.use(cors());
app.use(express.json());
// --------------------------------------------------

// --------------------------------------------------
app.get("/", (req, res) => {
  res.send("Welcome to Quick Shop");
});

app.listen(port, () => {
  console.log(`gadgets running on port ${port}`);
});
