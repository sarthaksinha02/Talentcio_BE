const API_URL = 'http://127.0.0.1:5000/api';

async function run() {
    try {
        console.log('Logging in as Admin...');
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@techcorp.com', password: 'password123' })
        });
        
        if (!loginRes.ok) {
            console.error('Login failed', await loginRes.text());
            return;
        }

        const data = await loginRes.json();
        const adminToken = data.token;
        const headers = { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}` 
        };

        // Create Timesheet
        console.log('Creating Timesheet for Admin...');
        const date = new Date().toISOString();
        
        // Get Project
        let projectId;
        const projRes = await fetch(`${API_URL}/timesheet/projects`, { headers });
        const projects = await projRes.json();
        if (projects.length > 0) {
            projectId = projects[0]._id;
        } else {
            console.log('Creating dummy project...');
            const pRes = await fetch(`${API_URL}/timesheet/projects`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Test P', client: {name: 'C'} })
            });
            projectId = (await pRes.json())._id;
        }

        // Add Entry
        await fetch(`${API_URL}/timesheet/entry`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                date: date,
                projectId: projectId,
                hours: 8,
                description: 'Test Work'
            })
        });

        // Submit
        const month = date.slice(0, 7); // YYYY-MM
        const submitRes = await fetch(`${API_URL}/timesheet/submit`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ month })
        });
        
        if (!submitRes.ok) {
           console.log('Submit failed (maybe already submitted):', await submitRes.text());
           // If already submitted, we need to find it
        }
        
        // We need the ID. If submit failed, we fetch current
        const currentRes = await fetch(`${API_URL}/timesheet/current`, { headers });
        const timesheet = await currentRes.json();
        const timesheetId = timesheet._id;
        console.log(`Timesheet ID: ${timesheetId}, Status: ${timesheet.status}`);

        // Approve (Reject)
        console.log('Attempting REJECT...');
        const rejectRes = await fetch(`${API_URL}/timesheet/${timesheetId}/approve`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                status: 'REJECTED',
                reason: 'Testing Rejection Script'
            })
        });

        if (rejectRes.ok) {
            const resData = await rejectRes.json();
            console.log('Reject Success:', resData.status, resData.rejectionReason);
        } else {
             console.error('Reject Failed:', rejectRes.status, await rejectRes.text());
        }

    } catch (error) {
        console.error('Script Error:', error);
    }
}

run();
