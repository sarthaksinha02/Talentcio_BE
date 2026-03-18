const Company = require('../models/Company');

/**
 * Middleware to identify the tenant (company) based on the subdomain or header.
 * Attaches the company object and companyId to the request for down-stream use.
 */
const tenantMiddleware = async (req, res, next) => {
    try {
        const host = req.headers.host;
        let subdomain = '';

        // 1. Extract subdomain from host
        if (host) {
            // Remove port if present (e.g., sarthak.localhost:5174 -> sarthak.localhost)
            const domain = host.split(':')[0];
            const parts = domain.split('.');

            // Example: company-a.talentcio.com -> parts = ['company-a', 'talentcio', 'com']
            // Example: sarthak.localhost -> parts = ['sarthak', 'localhost']
            if (domain.endsWith('localhost')) {
                if (parts.length > 1 && parts[0] !== 'localhost') {
                    subdomain = parts[0];
                }
            } else if (parts.length > 2) {
                subdomain = parts[0];
            }
        }

        // 2. Fallback to header or query param (useful for development/testing/mobile)
        const tenantHeader = req.headers['x-tenant-id'];
        const tenantQuery = req.query.tenant;

        if (!subdomain) {
            subdomain = tenantHeader || tenantQuery;
        }

        // If no subdomain is found, we might be hitting the landing page or a global route
        // We let it pass but without attaching a tenant
        if (!subdomain || subdomain === 'www' || subdomain === 'api' || subdomain === 'localhost') {
            return next();
        }

        const company = await Company.findOne({ subdomain: subdomain.toLowerCase() });

        if (!company) {
            return res.status(404).json({ message: `Workspace '${subdomain}' not found.` });
        }

        if (company.status === 'Suspended') {
            return res.status(403).json({ message: 'This workspace is suspended. Please contact support.' });
        }

        // Attach to request
        req.company = company;
        req.companyId = company._id;

        next();
    } catch (err) {
        console.error('Tenant Middleware Error:', err);
        res.status(500).json({ message: 'Error resolving tenant identity' });
    }
};

module.exports = tenantMiddleware;
