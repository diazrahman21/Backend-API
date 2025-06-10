const Joi = require('@hapi/joi');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Gender Mapping Constants
const FRONTEND_TO_DATASET = {
    0: 1, // Frontend Female (0) -> Dataset Female (1)
    1: 2  // Frontend Male (1) -> Dataset Male (2)
};

const DATASET_TO_FRONTEND = {
    1: 0, // Dataset Female (1) -> Frontend Female (0)
    2: 1  // Dataset Male (2) -> Frontend Male (1)
};

const DATASET_TO_ML = {
    1: 0, // Dataset Female (1) -> ML Female (0)
    2: 1  // Dataset Male (2) -> ML Male (1)
};

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ML Service Configuration
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'https://api-ml-production.up.railway.app';

// Enhanced prediction function that integrates with ML service
async function predictCardiovascularRisk(formData) {
    try {
        // Try multiple endpoints for ML service
        const endpoints = [
            `${ML_SERVICE_URL}/api/predict`,
            `${ML_SERVICE_URL}/predict`
        ];
        
        let mlResponse = null;
        
        for (const endpoint of endpoints) {
            try {
                console.log(`🔬 Trying ML endpoint: ${endpoint}`);
                mlResponse = await axios.post(endpoint, {
                    age: formData.age,
                    gender: DATASET_TO_ML[formData.gender], // Use mapping constant
                    height: formData.height,
                    weight: formData.weight,
                    ap_hi: formData.ap_hi,
                    ap_lo: formData.ap_lo,
                    cholesterol: formData.cholesterol,
                    gluc: formData.gluc,
                    smoke: formData.smoke,
                    alco: formData.alco,
                    active: formData.active
                }, {
                    timeout: 20000, // Increase timeout for Railway cold start
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
                
                if (mlResponse && mlResponse.data) {
                    console.log('✅ ML Service responded successfully');
                    break;
                }
            } catch (endpointError) {
                console.log(`❌ Endpoint ${endpoint} failed:`, endpointError.message);
                if (endpointError.response?.status) {
                    console.log(`   Status: ${endpointError.response.status}`);
                }
                continue;
            }
        }

        if (mlResponse && mlResponse.data) {
            console.log('🔬 ML Service Response:', JSON.stringify(mlResponse.data, null, 2));

            // Handle different response structures from Flask ML service
            if (mlResponse.data && (mlResponse.data.success || mlResponse.data.prediction !== undefined)) {
                const responseData = mlResponse.data.data || mlResponse.data;
                
                // Extract prediction data with fallback values
                const prediction = responseData.prediction !== undefined ? responseData.prediction : mlResponse.data.prediction;
                const confidence = responseData.confidence || mlResponse.data.confidence || 0.5;
                const probability = responseData.probability || mlResponse.data.probability || confidence;
                const riskLevel = responseData.risk_level || mlResponse.data.risk_level || (prediction === 1 ? 'HIGH' : 'LOW');
                
                // Calculate BMI if not provided
                const heightInM = formData.height / 100;
                const calculatedBMI = formData.weight / (heightInM * heightInM);
                const bmi = responseData.patient_data?.bmi || responseData.bmi || calculatedBMI.toFixed(1);
                
                return {
                    risk: prediction,
                    confidence: Math.round(confidence * 100),
                    probability: probability,
                    risk_label: riskLevel.toUpperCase() === 'HIGH' ? 'High Risk' : 'Low Risk',
                    bmi: bmi.toString(),
                    source: 'ml_model',
                    ml_details: {
                        model_confidence: confidence,
                        bmi_category: responseData.patient_data?.bmi_category || responseData.bmi_category || 'Unknown',
                        interpretation: responseData.interpretation || mlResponse.data.interpretation || 'ML prediction completed',
                        recommendation: responseData.result_message || mlResponse.data.result_message || responseData.recommendation || 'Follow medical advice'
                    }
                };
            }
        }
    } catch (error) {
        console.warn('⚠️ ML Service unavailable, falling back to rule-based prediction:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            code: error.code,
            url: `${ML_SERVICE_URL}/api/predict`
        });
    }

    // Fallback to rule-based prediction
    const heightInM = formData.height / 100;
    const bmi = formData.weight / (heightInM * heightInM);
    
    const riskFactors = [
        formData.age > 55 ? 25 : formData.age > 45 ? 15 : 5,
        formData.gender === 2 ? 10 : 5, // Male (2) has higher risk than female (1)
        bmi > 30 ? 20 : bmi > 25 ? 10 : 0,
        formData.ap_hi > 140 ? 25 : formData.ap_hi > 120 ? 15 : 5,
        formData.ap_lo > 90 ? 20 : formData.ap_lo > 80 ? 10 : 5,
        formData.cholesterol === 3 ? 25 : formData.cholesterol === 2 ? 15 : 0,
        formData.gluc === 3 ? 20 : formData.gluc === 2 ? 10 : 0,
        formData.smoke === 1 ? 15 : 0,
        formData.alco === 1 ? 5 : 0,
        formData.active === 0 ? 10 : 0
    ];
    
    const totalRisk = riskFactors.reduce((sum, risk) => sum + risk, 0);
    const confidence = Math.min(Math.max(totalRisk, 10), 95);
    const risk = confidence >= 65 ? 1 : 0;
    const probability = confidence / 100;
    
    return {
        risk,
        confidence,
        probability,
        risk_label: risk === 1 ? 'High Risk' : 'Low Risk',
        bmi: bmi.toFixed(1),
        source: 'rule_based'
    };
}

module.exports = {
    name: 'prediction-routes',
    register: async function (server) {
        // Add global OPTIONS handler for all /api/* routes
        server.route({
            method: 'OPTIONS',
            path: '/api/{path*}',
            handler: (request, h) => {
                return h.response()
                    .code(200)
                    .header('Access-Control-Allow-Origin', '*')
                    .header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
                    .header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-ID, Origin, X-Requested-With')
                    .header('Access-Control-Allow-Credentials', 'true')
                    .header('Access-Control-Max-Age', '86400');
            }
        });

        // Health check endpoint for ML service
        server.route({
            method: 'GET',
            path: '/api/ml-health',
            options: {
                cors: {
                    origin: ['*'],
                    credentials: false
                }
            },
            handler: async (request, h) => {
                try {
                    // Try multiple health endpoints
                    const healthEndpoints = [
                        `${ML_SERVICE_URL}/api/health`,
                        `${ML_SERVICE_URL}/health`,
                        `${ML_SERVICE_URL}/ping`
                    ];
                    
                    let response = null;
                    let usedEndpoint = '';
                    
                    for (const endpoint of healthEndpoints) {
                        try {
                            response = await axios.get(endpoint, {
                                timeout: 15000,
                                headers: { 'Accept': 'application/json' }
                            });
                            usedEndpoint = endpoint;
                            break;
                        } catch (err) {
                            console.log(`Health check failed for ${endpoint}:`, err.message);
                            continue;
                        }
                    }
                    
                    if (response && response.data) {
                        return h.response({
                            success: true,
                            ml_service: {
                                status: 'connected',
                                url: ML_SERVICE_URL,
                                health: response.data,
                                endpoint_used: usedEndpoint,
                                response_time: `${Date.now()}ms`,
                                timestamp: new Date().toISOString()
                            }
                        })
                        .code(200)
                        .header('Access-Control-Allow-Origin', '*');
                    }
                    
                    throw new Error('All health endpoints failed');
                    
                } catch (error) {
                    return h.response({
                        success: false,
                        ml_service: {
                            status: 'disconnected',
                            url: ML_SERVICE_URL,
                            error: error.message,
                            status_code: error.response?.status,
                            note: 'ML service may be starting up (cold start)',
                            fallback: 'rule-based prediction available',
                            timestamp: new Date().toISOString()
                        }
                    }).code(503);
                }
            }
        });

        // Enhanced prediction endpoint
        server.route({
            method: 'POST',
            path: '/api/predict',
            options: {
                cors: {
                    origin: ['*'],
                    credentials: false,
                    additionalHeaders: ['content-type', 'x-session-id', 'authorization', 'origin']
                },
                validate: {
                    payload: Joi.object({
                        age: Joi.number().integer().min(1).max(120).required(),
                        gender: Joi.number().integer().valid(1, 2).optional(), // Dataset format
                        sex: Joi.number().integer().valid(0, 1).optional(), // Frontend format
                        height: Joi.number().integer().min(100).max(250).required(),
                        weight: Joi.number().integer().min(30).max(200).required(),
                        ap_hi: Joi.number().integer().min(80).max(250).required(),
                        ap_lo: Joi.number().integer().min(40).max(150).required(),
                        cholesterol: Joi.number().integer().valid(1, 2, 3).required(),
                        gluc: Joi.number().integer().valid(1, 2, 3).required(),
                        smoke: Joi.number().integer().valid(0, 1).required(),
                        alco: Joi.number().integer().valid(0, 1).required(),
                        active: Joi.number().integer().valid(0, 1).required()
                    }).or('gender', 'sex')
                }
            },
            handler: async (request, h) => {
                try {
                    const inputData = request.payload;
                    console.log('📥 Received prediction request:', inputData);
                    
                    // Handle field mapping using constants
                    const normalizedData = {
                        age: inputData.age,
                        gender: inputData.gender || FRONTEND_TO_DATASET[inputData.sex], // Use mapping constant
                        height: inputData.height,
                        weight: inputData.weight,
                        ap_hi: inputData.ap_hi,
                        ap_lo: inputData.ap_lo,
                        cholesterol: inputData.cholesterol,
                        gluc: inputData.gluc,
                        smoke: inputData.smoke,
                        alco: inputData.alco,
                        active: inputData.active
                    };
                    
                    console.log('📊 Normalized data (Dataset format):', normalizedData);
                    
                    // Generate prediction with ML integration
                    const prediction = await predictCardiovascularRisk(normalizedData);
                    
                    // Save to Supabase with enhanced data
                    const predictionData = {
                        ...normalizedData,
                        risk_prediction: prediction.risk,
                        confidence_score: prediction.confidence,
                        probability: prediction.probability,
                        bmi: parseFloat(prediction.bmi),
                        prediction_source: prediction.source,
                        user_agent: request.headers['user-agent'] || null,
                        session_id: `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
                        ml_details: prediction.ml_details || null
                    };

                    const { data, error } = await supabase
                        .from('cardiovascular_predictions')
                        .insert([predictionData])
                        .select();

                    if (error) {
                        console.error('❌ Supabase error:', error);
                    } else {
                        console.log('✅ Prediction saved to Supabase:', data[0]);
                    }

                    // Enhanced response format
                    const response = {
                        success: true,
                        prediction: {
                            risk: prediction.risk,
                            confidence: prediction.confidence,
                            probability: prediction.probability,
                            risk_label: prediction.risk_label,
                            bmi: prediction.bmi,
                            source: prediction.source
                        },
                        patient_data: {
                            age: normalizedData.age,
                            gender: normalizedData.gender === 1 ? 'Female' : 'Male', // Dataset format text
                            sex: DATASET_TO_FRONTEND[normalizedData.gender], // Frontend format
                            height: normalizedData.height,
                            weight: normalizedData.weight,
                            bmi: prediction.bmi,
                            blood_pressure: `${normalizedData.ap_hi}/${normalizedData.ap_lo}`,
                            cholesterol: normalizedData.cholesterol === 1 ? 'Normal' : normalizedData.cholesterol === 2 ? 'Above Normal' : 'Well Above Normal',
                            glucose: normalizedData.gluc === 1 ? 'Normal' : normalizedData.gluc === 2 ? 'Above Normal' : 'Well Above Normal',
                            lifestyle: {
                                smoking: normalizedData.smoke === 1 ? 'Yes' : 'No',
                                alcohol: normalizedData.alco === 1 ? 'Yes' : 'No',
                                physical_activity: normalizedData.active === 1 ? 'Yes' : 'No'
                            }
                        },
                        ml_insights: prediction.ml_details || null,
                        saved: !error,
                        message: 'Prediction completed successfully',
                        // Frontend compatibility format
                        data: {
                            prediction: prediction.risk,
                            confidence: prediction.confidence,
                            probability: prediction.probability,
                            risk_level: prediction.risk_label === 'High Risk' ? 'HIGH' : 'LOW',
                            patient_data: {
                                bmi: parseFloat(prediction.bmi),
                                bmi_category: prediction.ml_details?.bmi_category || 'Unknown',
                                sex: DATASET_TO_FRONTEND[normalizedData.gender] // Frontend format in data section
                            },
                            interpretation: prediction.ml_details?.interpretation || 'Prediction completed',
                            result_message: prediction.ml_details?.recommendation || 'Please consult with healthcare professional'
                        },
                        // Add mapping reference for debugging
                        _mapping_info: {
                            received_format: inputData.sex !== undefined ? 'frontend' : 'dataset',
                            dataset_gender: normalizedData.gender,
                            frontend_sex: DATASET_TO_FRONTEND[normalizedData.gender],
                            ml_gender: DATASET_TO_ML[normalizedData.gender]
                        }
                    };

                    console.log('📤 Sending prediction response with mapping info');
                    
                    // Return response with comprehensive CORS headers
                    return h.response(response)
                        .code(200)
                        .header('Access-Control-Allow-Origin', '*')
                        .header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
                        .header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-ID, Origin, X-Requested-With')
                        .header('Access-Control-Allow-Credentials', 'false')
                        .header('Content-Type', 'application/json');
                        
                } catch (error) {
                    console.error('❌ Prediction error:', error);
                    return h.response({
                        success: false,
                        error: 'Internal server error',
                        message: error.message,
                        prediction_source: 'error'
                    })
                    .code(500)
                    .header('Access-Control-Allow-Origin', '*');
                }
            }
        });

        // Get predictions endpoint
        server.route({
            method: 'GET',
            path: '/api/predictions',
            options: {
                cors: {
                    origin: ['*'],
                    credentials: false
                },
                validate: {
                    query: Joi.object({
                        page: Joi.number().integer().min(1).default(1),
                        limit: Joi.number().integer().min(1).max(100).default(10),
                        riskLevel: Joi.number().integer().valid(0, 1).optional(),
                        gender: Joi.number().integer().valid(1, 2).optional()
                    })
                }
            },
            handler: async (request, h) => {
                try {
                    const { page, limit, riskLevel, gender } = request.query;
                    const offset = (page - 1) * limit;

                    let query = supabase
                        .from('cardiovascular_predictions')
                        .select('*', { count: 'exact' })
                        .order('created_at', { ascending: false })
                        .range(offset, offset + limit - 1);

                    if (riskLevel !== undefined) {
                        query = query.eq('risk_prediction', riskLevel);
                    }
                    if (gender !== undefined) {
                        query = query.eq('gender', gender);
                    }

                    const { data, error, count } = await query;

                    if (error) {
                        throw error;
                    }

                    return h.response({
                        success: true,
                        data,
                        pagination: {
                            page,
                            limit,
                            total: count,
                            totalPages: Math.ceil(count / limit)
                        }
                    })
                    .code(200)
                    .header('Access-Control-Allow-Origin', '*');
                } catch (error) {
                    console.error('❌ Get predictions error:', error);
                    return h.response({
                        success: false,
                        error: 'Failed to fetch predictions',
                        message: error.message
                    }).code(500);
                }
            }
        });

        // Statistics endpoint
        server.route({
            method: 'GET',
            path: '/api/statistics',
            options: {
                cors: {
                    origin: ['*'],
                    credentials: false
                }
            },
            handler: async (request, h) => {
                try {
                    const { data, error } = await supabase
                        .from('cardiovascular_predictions')
                        .select('risk_prediction, gender, age, bmi, prediction_source');

                    if (error) {
                        throw error;
                    }

                    const stats = {
                        total: data.length,
                        highRisk: data.filter(item => item.risk_prediction === 1).length,
                        lowRisk: data.filter(item => item.risk_prediction === 0).length,
                        byGender: {
                            male: data.filter(item => item.gender === 2).length, // 2 = Male
                            female: data.filter(item => item.gender === 1).length // 1 = Female
                        },
                        averageAge: data.length > 0 ? 
                            data.reduce((sum, item) => sum + item.age, 0) / data.length : 0,
                        averageBMI: data.filter(item => item.bmi).length > 0 ? 
                            data.filter(item => item.bmi).reduce((sum, item) => sum + parseFloat(item.bmi), 0) / 
                            data.filter(item => item.bmi).length : 0
                    };

                    return h.response({
                        success: true,
                        statistics: stats
                    })
                    .code(200)
                    .header('Access-Control-Allow-Origin', '*');
                } catch (error) {
                    console.error('❌ Statistics error:', error);
                    return h.response({
                        success: false,
                        error: 'Failed to get statistics',
                        message: error.message
                    }).code(500);
                }
            }
        });
    }
};
