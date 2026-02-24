const mongoose = require('mongoose');

const escalationRuleSchema = new mongoose.Schema({
    queryType: {
        type: String,
        enum: ['Payroll Issue', 'Leave Query', 'Benefits Query', 'Policy Query', 'IT Support', 'Other'],
        required: true,
        unique: true
    },
    firstLevelTeam: {
        type: String,
        required: true
    },
    escalationTeam: {
        type: String,
        required: true
    },
    escalationDays: {
        type: Number,
        default: 2
    },
    escalationRole: {
        type: String,
        enum: ['Admin', 'HR Manager', 'IT Manager'],
        default: 'Admin'
    }
});

module.exports = mongoose.model('EscalationRule', escalationRuleSchema);
