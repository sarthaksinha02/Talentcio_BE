const Company = require('../models/Company');

/**
 * Middleware to identify the tenant (company) based on the subdomain or header.
 * Attaches the company object and companyId to the request for down-stream use.
 */
const tenantMiddleware = async (req, res, next) => {
    try {
        const host = req.headers.host;
        // 1. Prioritize header or query param (explicitly set by frontend)
        const tenantHeader = req.headers['x-tenant-id'];
        const tenantQuery = req.query.tenant;
        subdomain = tenantHeader || tenantQuery;

        // 2. Fallback to host-based extraction (useful for local dev or same-domain setups)
        if (!subdomain && host) {
            const domain = host.split(':')[0];
            const parts = domain.split('.');

            if (domain.endsWith('localhost')) {
                if (parts.length > 1 && parts[0] !== 'localhost') {
                    subdomain = parts[0];
                }
            } else if (parts.length > 2) {
                // Ignore subdomains if they belong to known cloud hosting providers
                const cloudProviders = ['render.com', 'onrender.com', 'vercel.app', 'herokuapp.com'];
                const isCloudDomain = cloudProviders.some(p => domain.endsWith(p));
                
                if (!isCloudDomain) {
                    subdomain = parts[0];
                }
            }
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
