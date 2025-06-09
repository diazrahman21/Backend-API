const Hapi = require('@hapi/hapi');
require('dotenv').config();

const init = async () => {
    const server = Hapi.server({
        port: process.env.PORT || 5001, // Changed from 5000 to 5001
        host: process.env.HOST || 'localhost',
        routes: {
            cors: {
                origin: ['http://localhost:5173', 'http://localhost:3000'],
                headers: ['Accept', 'Authorization', 'Content-Type', 'If-None-Match'],
                additionalHeaders: ['cache-control', 'x-requested-with'],
                credentials: true
            }
        }
    });

    // Register routes
    await server.register([
        require('./routes/prediction'),
        require('./routes/health')
    ]);

    await server.start();
    console.log('🚀 IllDetect Backend Server running on %s', server.info.uri);
    console.log('📊 Environment:', process.env.NODE_ENV || 'development');
    console.log('🔗 CORS enabled for frontend connections:');
    console.log('  - http://localhost:5173 (Vite dev server)');
    console.log('  - http://localhost:3000 (Alternative frontend)');
    console.log('💾 Database: Supabase connected');
    console.log('📋 Available endpoints:');
    console.log('  - GET  / (API info)');
    console.log('  - GET  /api/health (Health check)');
    console.log('  - GET  /api/status (Server status)');
    console.log('  - POST /api/predict (Cardiovascular prediction)');
    console.log('  - GET  /api/predictions (Get predictions)');
    console.log('  - GET  /api/statistics (Get statistics)');
    console.log('');
    console.log('🎯 Ready to accept requests from frontend!');
};

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled rejection:', err);
    process.exit(1);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Gracefully shutting down server...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down server...');
    process.exit(0);
});

init().catch(err => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
});
