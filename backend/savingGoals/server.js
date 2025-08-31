const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const router = require('./router');

const app = express();
const port = 3001;
const host = '127.0.0.1';

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = 'mongodb+srv://jayakodyssj:2132@cluster0.mo5acww.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

const startServer = async () => {
    try {
        await mongoose.connect(uri);
        console.log('✅ Connected to MongoDB');

        // Use routes
        app.use('/api', router);

        // Start server
        app.listen(port, host, () => {
            console.log(`🚀 Server running at http://${host}:${port}`);
        });

    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
    }
};

startServer();
