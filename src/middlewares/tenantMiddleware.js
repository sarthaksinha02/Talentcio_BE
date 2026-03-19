const Company = require('../models/Company');

/**
 * Middleware to identify the tenant (company) based on the subdomain or header.
 * Attaches the company object and companyId to the request for down-stream use.
 */
const tenantMiddleware = async (req, res, next) => {
    try {
        // 1. Detect Host (Vercel uses x-forwarded-host, localhost uses host)
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        let subdomain = '';

        if (host) {
            const domain = host.split(':')[0];
            const parts = domain.split('.');

            // --- LOCALHOST HANDLING ---
            if (domain.endsWith('localhost')) {
                if (parts.length > 1 && parts[0] !== 'localhost') {
                    subdomain = parts[0];
                }
            } 
            // --- VERCEL / CLOUD HANDLING ---
            else if (domain.endsWith('vercel.app')) {
                // Extract the project prefix (e.g., telentcio-demo)
                subdomain = domain.replace('.vercel.app', '');
            } 
            // --- CUSTOM DOMAIN HANDLING ---
            else if (parts.length > 2) {
                const cloudProviders = ['render.com', 'onrender.com', 'herokuapp.com'];
                const isCloudDomain = cloudProviders.some(p => domain.endsWith(p));
                if (!isCloudDomain) {
                    subdomain = parts[0];
                }
            }
        }

        // 2. Fallback to header or query param (Explicit Override)
        const tenantHeader = req.headers['x-tenant-id'];
        const tenantQuery = req.query.tenant;
        if (tenantHeader || tenantQuery) {
            subdomain = tenantHeader || tenantQuery;
        }

        // 3. Skip resolution for non-tenant routes
        const isNonTenantSubdomain = !subdomain || ['www', 'api', 'localhost'].includes(subdomain.toLowerCase());
        if (isNonTenantSubdomain) {
            return next();
        }

        // 4. Resolve Company
        const company = await Company.findOne({ subdomain: subdomain.toLowerCase() });

        if (!company) {
            console.log(`[TENANT_ERROR] Workspace '${subdomain}' not found from host: ${host}`);
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
