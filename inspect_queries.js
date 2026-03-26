const mongoose = require('mongoose');
require('dotenv').config();
const HelpdeskQuery = require('./src/models/HelpdeskQuery');
const User = require('./src/models/User');

const inspect = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const ids = ['69b3cf1c3827ea498cddf089', '69c4d804488b60bab673f92e'];
        
        for (const id of ids) {
            console.log(`\n--- Inspecting ${id} ---`);
            const query = await HelpdeskQuery.findById(id).populate('raisedBy assignedTo').lean();
            if (query) {
                console.log('Found Query:');
                console.log('- Status:', query.status);
                console.log('- CompanyId:', query.companyId);
                console.log('- RaisedBy:', query.raisedBy?.email || query.raisedBy);
                console.log('- AssignedTo:', query.assignedTo?.email || query.assignedTo);
            } else {
                console.log('NOT FOUND in HelpdeskQuery');
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

inspect();
