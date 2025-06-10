const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

module.exports = {
    name: 'health-routes',
    register: async function (server) {
        // Root API info endpoint
        server.route({
            method: 'GET',
            path: '/',
            handler: (request, h) => {
                return {
                    message: 'IllDetect Backend API',
                    service: 'cardiovascular-prediction',
                    version: '1.0.0',
                    status: 'healthy',
                    environment: process.env.NODE_ENV || 'development',
                    timestamp: new Date().toISOString(),
                    database: {
                        supabase: 'connected',
                        url: process.env.SUPABASE_URL ? 'configured' : 'not_configured'
                    },
                    endpoints: {
                        'GET /': 'API information',
                        'GET /api/health': 'Health check',
                        'GET /api/status': 'Server status',
                        'GET /api/ml-health': 'ML service health check',
                        'POST /api/predict': 'Cardiovascular disease prediction',
                        'GET /api/predictions': 'Get prediction history',
                        'GET /api/statistics': 'Get prediction statistics'
                    }
                };
            }
        });

        // Health check endpoint
        server.route({
            method: 'GET',
            path: '/api/health',
            handler: (request, h) => {
                return {
                    status: 'healthy',
                    service: 'IllDetect Backend',
                    timestamp: new Date().toISOString(),
                    uptime: Math.floor(process.uptime()),
                    memory: {
                        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
                    },
                    version: '1.0.0',
                    environment: process.env.NODE_ENV || 'development',
                    supabase: process.env.SUPABASE_URL ? 'configured' : 'not_configured'
                };
            }
        });

        // Server status endpoint
        server.route({
            method: 'GET',
            path: '/api/status',
            handler: async (request, h) => {
                return {
                    status: 'operational',
                    services: {
                        database: {
                            status: process.env.SUPABASE_URL ? 'configured' : 'not_configured',
                            provider: 'Supabase',
                            project: process.env.SUPABASE_URL ? 'gczyorsjoxzunuqlebdd' : null
                        },
                        ml_service: {
                            status: 'external',
                            url: process.env.ML_SERVICE_URL || 'https://api-ml-production.up.railway.app',
                            note: 'Check /api/ml-health for detailed status'
                        },
                        prediction: {
                            status: 'operational',
                            fallback: 'rule_based_available'
                        }
                    },
                    server: {
                        uptime: Math.floor(process.uptime()),
                        memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                        timestamp: new Date().toISOString()
                    }
                };
            }
        });
    }
};
