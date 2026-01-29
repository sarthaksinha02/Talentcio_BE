require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User'); // Ensure path is correct
const Company = require('./src/models/Company');

const API_URL = 'http://127.0.0.1:5000/api';

async function run() {
    let connection;
    try {
        // 0. Connect to DB to setup users
        console.log('Connecting to DB...');
        connection = await mongoose.connect(process.env.MONGODB_URI);
        
        // 1. Get Company
        const company = await Company.findOne();
        if (!company) throw new Error('No company found');
        const companyId = company._id;

        // 2. Create Users Directly
        const mgrEmail = `mgr_${Date.now()}@test.com`;
        const empEmail = `emp_${Date.now()}@test.com`;
        const password = 'password123';

        console.log(`Creating Manager: ${mgrEmail}`);
        const manager = await User.create({
            firstName: 'Test', lastName: 'Manager',
            email: mgrEmail, password: password,
            company: companyId, isActive: true
        });

        console.log(`Creating Employee: ${empEmail}`);
        const employee = await User.create({
            firstName: 'Test', lastName: 'Employee',
            email: empEmail, password: password,
            company: companyId, isActive: true,
            reportingManager: manager._id // Assign Manager
        });

        // 3. Login to get Tokens
        console.log('Logging in Manager...');
        const mgrLogin = await fetch(`${API_URL}/auth/login`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email: mgrEmail, password })
        });
        const mgrToken = (await mgrLogin.json()).token;

        console.log('Logging in Employee...');
        const empLogin = await fetch(`${API_URL}/auth/login`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email: empEmail, password })
        });
        const empToken = (await empLogin.json()).token;

        // 4. Employee Submits Timesheet
        console.log('Employee Submitting Timesheet...');
        const empHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${empToken}` };
        
        // Get Projects
        const pRes = await fetch(`${API_URL}/timesheet/projects`, { headers: empHeaders });
        const projects = await pRes.json();
        let projectId = projects[0]?._id;
        
        if (!projectId) {
             // Create if none (needs admin, or just use fake ID? No, needs valid ID)
             // Let's assume projects exist from seed. Or fail.
             console.log('No projects found, trying to proceed... (Might fail constraint)');
             // Attempt to create one via Admin if needed, or assume seed.js ran.
             // Assume seed ran.
        }

        const date = new Date().toISOString();
        await fetch(`${API_URL}/timesheet/entry`, {
            method: 'POST', headers: empHeaders,
            body: JSON.stringify({ date, projectId, hours: 8, description: 'Work' })
        });

        const month = date.slice(0, 7);
        const submitRes = await fetch(`${API_URL}/timesheet/submit`, {
             method: 'POST', headers: empHeaders, body: JSON.stringify({ month })
        });
        const timesheet = await submitRes.json();
        const tsId = timesheet._id;
        console.log(`Timesheet Submitted: ${tsId}`);

        // 5. Manager Rejects
        console.log('Manager Rejecting...');
        const mgrHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mgrToken}` };
        
        const rejectRes = await fetch(`${API_URL}/timesheet/${tsId}/approve`, {
            method: 'PUT',
            headers: mgrHeaders,
            body: JSON.stringify({ status: 'REJECTED', reason: 'Manager Test Rejection' })
        });

        if (rejectRes.ok) {
            console.log('SUCCESS: Manager Rejected Timesheet');
        } else {
            console.error('FAILURE: Manager Could NOT Reject', rejectRes.status, await rejectRes.text());
        }

    } catch (error) {
        console.error('Script Error:', error);
    } finally {
        if (connection) await mongoose.disconnect();
    }
}

run();
