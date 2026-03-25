const mongoose = require('mongoose');
require('dotenv').config();
const Company = require('./src/models/Company');

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const companies = await Company.find({ 
      subdomain: { $in: ['telentcio', 'telentcio-demo'] } 
    }, 'name subdomain status').lean();
    console.log(JSON.stringify(companies, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

check();
