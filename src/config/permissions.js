module.exports = [
    // USER MANAGEMENT
    {
        key: "user.create",
        module: "USER",
        description: "Create new users"
    },
    {
        key: "user.read",
        module: "USER",
        description: "View user details"
    },
    {
        key: "user.update",
        module: "USER",
        description: "Update user details"
    },
    {
        key: "user.delete",
        module: "USER",
        description: "Deactivate or delete users"
    },

    // ROLE MANAGEMENT
    {
        key: "role.create",
        module: "ROLE",
        description: "Create new roles"
    },
    {
        key: "role.read",
        module: "ROLE",
        description: "View roles and permissions"
    },
    {
        key: "role.update",
        module: "ROLE",
        description: "Update roles and permissions"
    },

    // TIMESHEET
    {
        key: "timesheet.submit",
        module: "TIMESHEET",
        description: "Submit own timesheets"
    },
    {
        key: "timesheet.approve",
        module: "TIMESHEET",
        description: "Approve submitted timesheets"
    },
    {
        key: "timesheet.export",
        module: "TIMESHEET",
        description: "Export timesheet reports"
    },

    // ATTENDANCE
    {
        key: "attendance.clock_in",
        module: "ATTENDANCE",
        description: "Clock in and out"
    },
    {
        key: "attendance.view",
        module: "ATTENDANCE",
        description: "View entire Attendance Tab and Export"
    },
    {
        key: "attendance.approve",
        module: "ATTENDANCE",
        description: "Approve manual attendance requests"
    },
    {
        key: "attendance.export",
        module: "ATTENDANCE",
        description: "Export attendance reports"
    },
    {
        key: "attendance.update_self",
        module: "ATTENDANCE",
        description: "Edit own attendance time (Regularization)"
    },

    // PROJECT MANAGEMENT
    // --- PROJECT MANAGEMENT: BUSINESS UNITS ---
    {
        key: "business_unit.create",
        module: "PROJECT",
        description: "Create business units"
    },
    {
        key: "business_unit.read",
        module: "PROJECT",
        description: "View business units"
    },
    {
        key: "business_unit.update",
        module: "PROJECT",
        description: "Update business units"
    },

    // --- PROJECT MANAGEMENT: CLIENTS ---
    {
        key: "client.create",
        module: "PROJECT",
        description: "Create clients"
    },
    {
        key: "client.read",
        module: "PROJECT",
        description: "View clients"
    },
    {
        key: "client.update",
        module: "PROJECT",
        description: "Update clients"
    },

    // --- PROJECT MANAGEMENT: PROJECTS ---
    {
        key: "project.create",
        module: "PROJECT",
        description: "Create projects"
    },
    {
        key: "project.read",
        module: "PROJECT",
        description: "View projects"
    },
    {
        key: "project.update",
        module: "PROJECT",
        description: "Update projects"
    },
    {
        key: "project.export_report",
        module: "PROJECT",
        description: "Export project reports"
    },

    // --- PROJECT MANAGEMENT: TASKS ---
    {
        key: "task.create",
        module: "PROJECT",
        description: "Create tasks"
    },
    {
        key: "task.read", // Added for consistency, though usually implies viewing project details
        module: "PROJECT",
        description: "View tasks"
    },
    {
        key: "task.update",
        module: "PROJECT",
        description: "Update tasks"
    }
];
