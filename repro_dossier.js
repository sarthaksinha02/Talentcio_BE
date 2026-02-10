
const dossierController = require('./src/controllers/dossierController');

// Mock User (Non-Admin, No Permissions)
const mockUser = {
    _id: 'user123',
    roles: [{ name: 'Employee' }], // Assuming role has NO permissions populated or empty
    company: 'comp123'
};

// Mock User with undefined roles (Edge case)
const mockUserNoRoles = {
    _id: 'user456',
    // roles undefined
    company: 'comp123'
};

const mockReq = {
    params: { userId: 'user123' },
    user: mockUser
};

const mockRes = {
    status: function (code) {
        console.log('Response Status:', code);
        return this;
    },
    json: function (data) {
        console.log('Response JSON:', data);
        return this;
    }
};

// We need to mock Mongoose models because the controller calls them
// This is tricky without a real DB connection.
// Instead, let's call filterProfileFields directly if exported, or recreate it.

// WAIT: filterProfileFields is NOT exported. It's internal to the module.
// So we must rely on code analysis or running the app.

// Let's look at the code again.
/*
const filterProfileFields = (profile, viewer, isSelf) => {
    let profileObj = profile.toObject();
    const permissions = viewer.permissions || [];  <-- POTENTIAL CRASH?
    // ...
*/

// If `viewer` is `req.user`.
// In `mockUser`, `permissions` is undefined.
// `const permissions = undefined || []` -> `[]`. Safe.

// What if `viewer` is null?
// `req.user` is guaranteed by middleware.

// What if `profile.toObject` fails?
// `profile` comes from `EmployeeProfile.findOne`. If found, it's a doc.

// HYPOTHESIS: `req.user.roles` might be populated differently.
// In `authMiddleware`, we populate:
// path: 'roles', populate: { path: 'permissions' }
// So `req.user.roles` is `[{ name: 'Role', permissions: [{ key: 'dossier.view' }] }]`.

// Inside `filterProfileFields`:
// `const permissions = viewer.permissions || [];`
// `viewer` is `req.user`. `req.user.permissions` is UNDEFINED.
// So permissions = [].

// `const roles = Array.isArray(viewer.roles) ? viewer.roles : [];`
// roles = `[{ name: 'Employee', permissions: [...] }]`

// `const canViewSensitive = isAdmin || permissions.includes('dossier.view.sensitive');`
// `permissions` is []. So `permissions.includes` is false.
// `canViewSensitive` = false.

// `if (!canViewSensitive && !isSelf)`
// If user viewing THEMSELVES: `isSelf` = true.
// `!false && !true` -> `true && false` -> `false`.
// IT WORKS.

// So why 500?

// Maybe `profile.toObject()` is the issue?
// If `profile` is null/undefined?
// `if (!profile)` block handles creation.
// But wait, `if (!profile)` block ends with:
// `await profile.save();`
// `await User.findByIdAndUpdate(...)`
// `profile = await EmployeeProfile.findById(...)`
// So `profile` refers to the new doc.

// Is it possible `profile` variable is const? No, `let profile`.
// Is it possible `profile` is undefined after `findById`? Unlikely.

// Let's look at the "Critical Fix" block.
// `if (profile.skills && Array.isArray(profile.skills))`
// If `profile` is a mongoose doc. `profile.skills` is the field.
// If it's a new profile, we initialized it as object.

// What if `filterProfileFields` is called with something else?

// ERROR: `viewer.permissions` usage?
// Wait, `filterProfileFields` assumes `viewer` has `permissions` array?
// `const permissions = viewer.permissions || [];`
// If `viewer` (req.user) does NOT have `permissions` property, it defaults to [].
// It DOES NOT fail.

// What if `req.user.roles` contains nulls?
// `const isAdmin = roles.some(r => r && r.name === 'Admin');`
// Safe check `r &&`.

// WHAT IF `req.user` is somehow NULL in `getDossier`?
// `const viewerId = req.user._id.toString();`
// If `req.user` is null, this throws TypeError.
// But `protect` middleware ensures `req.user` is set, or returns 401.

// Let's assume the stack trace is commented out, so we don't see the error.
// The user said "Failed to load employee dossier".
// This message is NOT in the code I see!
// The code sends `res.status(500).json({ message: 'Server Error', ... })`.
// OR `res.status(404).json({ message: 'Profile not found' })`.
// OR `res.status(400).json({ message: 'Data Error...' })`.

// Is "Failed to load employee dossier" a FRONTEND error message?
// Let's check frontend `EmployeeDossier.jsx`.
/*
        } catch (error) {
            console.error(error);
            toast.error('Failed to load employee dossier');
*/
// YES! It's a generic frontend error message.
// So looking for "Failed to load employee dossier" in backend is wrong.
// The backend error is inside the `catch` block of `getDossier`.

// If the user sees a 500, it means it crashed.

// Let's look at `dossierController.js` lines 1-150 again.
// Is `extractPublicIdFromUrl` used?
// No, not in `getDossier`.

// What about `populate` in `getDossier`?
/*
            .populate({
                path: 'user',
                select: 'firstName lastName email employeeCode roles department joiningDate employmentType',
                populate: { path: 'roles', select: 'name' }
            })
*/
// If `populate` fails? Mongoose usually safeguards.

// Let's enable the stack trace log or ask the user to provide logs.
// I already added console logs.

// Wait. `const companyId = targetUser.company || req.user.company;`
// If `targetUser` is null (handled).
// If `req.user` is defined.

// Is it possible `filterProfileFields` is NOT defined?
// No, I see it.

// Is it possible `hasPermission` helper I added earlier is colliding?
// No, I added it later in the file? Or earlier?

// Let's look at `skills` fix again.
/*
        if (profile.skills && Array.isArray(profile.skills)) {
            // ...
            profile.skills = { ... };
            profile.markModified('skills');
            await profile.save();
        }
*/
// If `profile` is a mongoose document, `profile.skills` returns a Proxy/Object.
// `Array.isArray` checking Mongoose array? Mongoose arrays behave like arrays.
// `profile.skills` in schema is Object?
// Let's check `EmployeeProfile.js` schema.
