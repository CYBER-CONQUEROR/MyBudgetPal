//Password : wvRt5OWvY2GFGbpy;

const express = require("express");
const mongoose = require("mongoose");
const router = require("./Routes/SavingRoutes");

const app = express();

//Middleware
app.use(express.json());
app.use("/users",router);


mongoose.connect("mongodb+srv://admin:wvRt5OWvY2GFGbpy@cluster0.mo5acww.mongodb.net/")
.then(()=> console.log("Connected to MongoDBB"))
.then(()=> {
    app.listen(5000);
})
.catch((err)=> console.log((err)));