const mongoose = require('mongoose');

const queryTypeSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    assignedRole: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
    assignedPerson: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    enableEscalation: { type: Boolean, default: false },
    escalationDays: { type: Number, default: 2 },
    escalationRole: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
    escalationPerson: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('QueryType', queryTypeSchema);
