const mongoose = require("mongoose");
const app = require("./app");

const PORT = 3001; 
const MONGO_URI = "mongodb+srv://amayaperera:Amaya123%40@cluster0.b4js8qv.mongodb.net/bankDB?retryWrites=true&w=majority";


mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("DB connection failed:", err.message);
    process.exit(1);
  });
