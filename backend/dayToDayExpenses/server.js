const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const expenseRoutes = require('./Routes/expenseRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
// You must replace 'yourUsername' and 'yourPassword' with your actual MongoDB Atlas credentials.
const MONGO_URI = "mongodb+srv://Kaveesha:kaveesha@cluster0.48n97cq.mongodb.net/dayToDayExpenses";

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected successfully!'))
    .catch(err => console.error('MongoDB connection error:', err));

// API Routes
app.use('/api/expenses', expenseRoutes);

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});