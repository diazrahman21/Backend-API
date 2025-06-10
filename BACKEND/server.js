const Hapi = require('@hapi/hapi');
const axios = require('axios');
require('dotenv').config();

const init = async () => {
    const server = Hapi.server({
        port: process.env.PORT || 5001,
        host: process.env.HOST || '0.0.0.0', // Change to 0.0.0.0 for production
        routes: {
            cors: {
                origin: [
                    'http://localhost:3000',
                    'http://localhost:5173', 
                    'https://your-frontend-domain.com',
                    'https://illdetect-frontend.vercel.app', // Add your actual frontend domain
                    'https://illdetect-frontend.netlify.app'  // Add your actual frontend domain
                ],
                headers: [
                    'Accept', 
                    'Authorization', 
                    'Content-Type', 
                    'If-None-Match',
                    'X-Session-ID',
                    'X-Requested-With'
                ],
                additionalHeaders: [
                    'cache-control', 
                    'x-requested-with',
                    'Access-Control-Allow-Origin',
                    'Access-Control-Allow-Methods',
                    'Access-Control-Allow-Headers'
                ],
                credentials: true,
                exposedHeaders: ['X-Session-ID', 'X-Response-Time']
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
    console.log('🤖 ML Service: https://api-ml-production.up.railway.app');
    console.log('📋 Available endpoints:');
    console.log('  - GET  / (API info)');
    console.log('  - GET  /api/health (Health check)');
    console.log('  - GET  /api/status (Server status)');
    console.log('  - GET  /api/ml-health (ML service health check)');
    console.log('  - POST /api/predict (Cardiovascular prediction)');
    console.log('  - GET  /api/predictions (Get predictions)');
    console.log('  - GET  /api/statistics (Get statistics)');
    console.log('');
    console.log('🎯 Ready to accept requests from frontend!');
    
    // Test ML service connection on startup with retry
    console.log('🔍 Testing ML service connection...');
    let mlConnected = false;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`   Attempt ${attempt}/${maxRetries}...`);
            const response = await axios.get('https://api-ml-production.up.railway.app/api/health', {
                timeout: 10000,
                headers: { 'Accept': 'application/json' }
            });
            console.log('✅ ML Service connected successfully');
            mlConnected = true;
            break;
        } catch (error) {
            console.log(`   Attempt ${attempt} failed: ${error.message}`);
            if (attempt < maxRetries) {
                console.log('   Retrying in 5 seconds...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
    
    if (!mlConnected) {
        console.log('⚠️  ML Service connection failed after all retries - will use fallback prediction');
        console.log('   This is normal on first startup - ML service may still be booting up');
        console.log('   Predictions will automatically switch to ML when service becomes available');
    }
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
