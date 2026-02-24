const cron = require('node-cron');
const HelpdeskQuery = require('../models/HelpdeskQuery');
const User = require('../models/User');

const startEscalationCron = () => {
    // Run every hour
    cron.schedule('0 * * * *', async () => {
        console.log('[CRON] Running Helpdesk Escalation check...');
        try {
            const pendingQueries = await HelpdeskQuery.find({
                status: { $in: ['New', 'In Progress'] }
            }).populate('queryType');

            const now = new Date();

            for (const query of pendingQueries) {
                const createdAt = new Date(query.createdAt);
                const diffTime = Math.abs(now - createdAt);
                const diffHours = diffTime / (1000 * 60 * 60);

                // Determine the threshold for this query
                const qType = query.queryType;
                const escalationDays = (qType && qType.enableEscalation && qType.escalationDays) ? qType.escalationDays : 2;
                const thresholdHours = escalationDays * 24;

                if (diffHours >= thresholdHours) {
                    console.log(`[CRON] Escalating Query ${query.queryId} (${diffHours.toFixed(2)} hours old, Threshold: ${thresholdHours}h)`);

                    query.status = 'Escalated';
                    query.escalatedAt = now;

                    let commentText = `[SYSTEM] This query has been automatically escalated because it exceeded the ${thresholdHours}-hour SLA.`;

                    // Check if there is a custom escalation person to reassign to
                    if (qType && qType.enableEscalation && qType.escalationPerson) {
                        query.assignedTo = qType.escalationPerson;
                        commentText += ` It has been re-assigned to the designated escalation contact.`;
                    } else {
                        commentText += ` Admins please review.`;
                    }

                    query.comments.push({
                        user: query.raisedBy, // The system comment uses the raiser's ID temporarily or could be a fixed admin ID. Keeping original behavior.
                        text: commentText,
                        createdAt: now
                    });

                    await query.save();
                }
            }

            console.log('[CRON] Helpdesk Escalation check completed.');
        } catch (error) {
            console.error('[CRON] Error during escalation check:', error);
        }
    });
};

module.exports = startEscalationCron;
