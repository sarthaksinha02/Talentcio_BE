const Company = require('../models/Company');

/**
 * Middleware to identify the tenant (company) based on the subdomain or header.
 * Attaches the company object and companyId to the request for down-stream use.
 */
const tenantMiddleware = async (req, res, next) => {
    try {
        const host = req.headers.host;
        let subdomain = '';

        // 1. Detect subdomain from host (Priority 1 - Source of Truth)
        if (host) {
            const domain = host.split(':')[0];
            const parts = domain.split('.');

            if (domain.endsWith('localhost')) {
                if (parts.length > 1 && parts[0] !== 'localhost') {
                    subdomain = parts[0];
                }
            } else if (parts.length > 2) {
                // If it's a Vercel domain, use the prefix as the subdomain
                // e.g. anything.vercel.app -> subdomain = 'anything'
                if (domain.endsWith('vercel.app')) {
                    subdomain = domain.replace('.vercel.app', '');
                } else {
                    // Ignore other cloud providers
                    const cloudProviders = ['render.com', 'onrender.com', 'herokuapp.com'];
                    const isCloudDomain = cloudProviders.some(p => domain.endsWith(p));
                    if (!isCloudDomain) {
                        subdomain = parts[0];
                    }
                }
            }
        }

        // 2. Fallback to header or query param (Only if no host subdomain was detected)
        if (!subdomain || subdomain === 'www' || subdomain === 'api') {
            const tenantHeader = req.headers['x-tenant-id'];
            const tenantQuery = req.query.tenant;
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
