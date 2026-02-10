
const dossierController = require('./src/controllers/dossierController');
const { mockRequest, mockResponse } = require('mock-req-res'); // Pseudo-code, we'll mock manually

// Mock Models
const EmployeeProfile = require('./src/models/EmployeeProfile');
const AuditLog = require('./src/models/AuditLog');

// Mock Data
const adminUser = { _id: 'admin1', roles: [{ name: 'Admin' }] };
const approverUser = { _id: 'approver1', roles: [{ name: 'User', permissions: [{ key: 'dossier.approve' }] }] };
const editorUser = { _id: 'editor1', roles: [{ name: 'User', permissions: [{ key: 'dossier.edit' }] }] };
const managerUser = { _id: 'manager1', roles: [{ name: 'manager' }] }; // No permissions
const normalUser = { _id: 'user1', roles: [{ name: 'User' }] };

const targetUser = { _id: 'target1' };
const targetProfile = {
    user: 'target1',
    employment: { reportingManager: { _id: 'manager1' } },
    hris: { status: 'Pending Approval' },
    documents: [],
    save: async () => { },
    toObject: () => ({})
};

// Mocks
EmployeeProfile.findOne = async () => ({ ...targetProfile, populate: async () => ({ ...targetProfile }) });
AuditLog.create = async () => { };

const runTest = async (name, user, action, expectedStatus) => {
    const req = {
        user: user,
        params: { userId: 'target1' },
        body: {}
    };

    let responseStatus;
    let responseData;

    const res = {
        status: (code) => { responseStatus = code; return res; },
        json: (data) => { responseData = data; return res; },
        setHeader: () => { },
        end: () => { }
    };

    try {
        await action(req, res);
        if (responseStatus === expectedStatus) {
            console.log(`[PASS] ${name}`);
        } else {
            console.error(`[FAIL] ${name}: Expected ${expectedStatus}, got ${responseStatus}. Msg: ${responseData?.message}`);
        }
    } catch (e) {
        console.error(`[ERR ] ${name}: ${e.message}`);
    }
};

(async () => {
    console.log('--- Testing Approve HRIS ---');
    await runTest('Admin Approve', adminUser, dossierController.approveHRIS, 200);
    await runTest('Permission Holder Approve', approverUser, dossierController.approveHRIS, 200);
    await runTest('Manager without Permission Approve (Expect Fail)', managerUser, dossierController.approveHRIS, 403);
    await runTest('Normal User Approve (Expect Fail)', normalUser, dossierController.approveHRIS, 403);

    console.log('--- Testing Reject HRIS ---');
    await runTest('Manager without Permission Reject (Expect Fail)', managerUser, dossierController.rejectHRIS, 403);

    console.log('--- Testing Get HRIS Requests (Strict View) ---');
    // Note: getHRISRequests response logic is filtered inside
    // We check if it returns 403 or empty array for unauthorized
    // Current implementation: Returns 200 with data if authorized, 403 if not
    await runTest('Manager without Permission Get Requests', managerUser, dossierController.getHRISRequests, 403);
    await runTest('Permission Holder Get Requests', approverUser, dossierController.getHRISRequests, 200);

})();
