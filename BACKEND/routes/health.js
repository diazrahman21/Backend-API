const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

module.exports = {
    name: 'health-routes',
    register: async function (server) {
        // Root endpoint
        server.route({
            method: 'GET',
            path: '/',
            handler: (request, h) => {
                return {
                    message: 'IllDetect Backend API',
                    version: '1.0.0',
                    status: 'healthy',
                    timestamp: new Date().toISOString()
                };
            }
        });

        // Health check endpoint
        server.route({
            method: 'GET',
            path: '/api/health',
            handler: async (request, h) => {
                try {
                    // Test Supabase connection
                    const { data, error } = await supabase
                        .from('cardiovascular_predictions')
                        .select('count', { count: 'exact', head: true });

                    const healthStatus = {
                        success: true,
                        message: 'IllDetect API is healthy',
                        timestamp: new Date().toISOString(),
                        supabase: error ? 'disconnected' : 'connected',
                        version: process.env.API_VERSION || '1.0.0',
                        uptime: Math.floor(process.uptime()),
                        environment: process.env.NODE_ENV || 'development',
                        database_status: error ? 'error' : 'connected'
                    };

                    console.log('🔍 Health check performed:', healthStatus);
                    return h.response(healthStatus).code(200);

                } catch (error) {
                    console.error('❌ Health check failed:', error);
                    return h.response({
                        success: false,
                        message: 'Service unhealthy',
                        error: error.message,
                        timestamp: new Date().toISOString(),
                        database_status: 'error'
                    }).code(500);
                }
            }
        });

        // API status endpoint  
        server.route({
            method: 'GET',
            path: '/api/status',
            handler: (request, h) => {
                const statusInfo = {
                    success: true,
                    message: 'IllDetect API is running',
                    timestamp: new Date().toISOString(),
                    uptime: Math.floor(process.uptime()),
                    memory: {
                        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
                    },
                    version: process.env.API_VERSION || '1.0.0',
                    node_version: process.version,
                    platform: process.platform
                };

                console.log('📊 Status check:', statusInfo);
                return h.response(statusInfo).code(200);
            }
        });

        // API info endpoint
        server.route({
            method: 'GET',
            path: '/api/info',
            handler: (request, h) => {
                return h.response({
                    name: 'IllDetect Backend API',
                    description: 'Backend service for cardiovascular risk prediction',
                    version: process.env.API_VERSION || '1.0.0',
                    author: 'Capstone Coding Camp - IllDetect Team',
                    license: 'MIT',
                    repository: 'https://github.com/capstone-project/illdetect',
                    build_date: new Date().toISOString(),
                    node_env: process.env.NODE_ENV || 'development'
                }).code(200);
            }
        });
    }
};
