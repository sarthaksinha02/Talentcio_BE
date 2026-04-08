const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const Role = require('./src/models/Role');

    try {
        console.log('Dropping index name_1_company_1...');
        await Role.collection.dropIndex('name_1_company_1');
        console.log('Drop successful. Current indexes:', await Role.collection.indexes());
    } catch (err) {
        console.error('Error dropping index:', err.message);
    }

    process.exit(0);
});
