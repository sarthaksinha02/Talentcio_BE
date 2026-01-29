const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('Error connecting to MongoDB:', err.message);
        // Don't exit process in development if DB is missing, just log error, 
        // but for now exit is fine or maybe better to keep server running?
        // Standard practice: exit if DB is critical.
        process.exit(1);
    }
};

module.exports = connectDB;
