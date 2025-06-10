const Joi = require('@hapi/joi');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios'); // Add this import

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
        // First, try ML service prediction
        const mlResponse = await axios.post(`${ML_SERVICE_URL}/api/predict`, {
            age: formData.age,
            gender: formData.gender === 1 ? 0 : 1, // Fix gender mapping: 1=female->0, 2=male->1
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
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

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
    } catch (error) {
        console.warn('⚠️ ML Service unavailable, falling back to rule-based prediction:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            url: `${ML_SERVICE_URL}/api/predict`,
            responseData: error.response?.data
        });
    }

    // Fallback to rule-based prediction
    const heightInM = formData.height / 100;
    const bmi = formData.weight / (heightInM * heightInM);
    
    const riskFactors = [
        formData.age > 55 ? 25 : formData.age > 45 ? 15 : 5,
        formData.gender === 2 ? 10 : 5,
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
        // Health check endpoint for ML service
        server.route({
            method: 'GET',
            path: '/api/ml-health',
            handler: async (request, h) => {
                try {
                    // Try both /health and /api/health endpoints
                    let response;
                    try {
                        response = await axios.get(`${ML_SERVICE_URL}/api/health`, {
                            timeout: 10000,
                            headers: { 'Accept': 'application/json' }
                        });
                    } catch (err) {
                        // Fallback to /health endpoint
                        response = await axios.get(`${ML_SERVICE_URL}/health`, {
                            timeout: 10000,
                            headers: { 'Accept': 'application/json' }
                        });
                    }
                    
                    return h.response({
                        success: true,
                        ml_service: {
                            status: 'connected',
                            url: ML_SERVICE_URL,
                            health: response.data,
                            endpoint_used: response.config.url,
                            timestamp: new Date().toISOString()
                        }
                    }).code(200);
                } catch (error) {
                    return h.response({
                        success: false,
                        ml_service: {
                            status: 'disconnected',
                            url: ML_SERVICE_URL,
                            error: error.message,
                            status_code: error.response?.status,
                            response_data: error.response?.data,
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
                validate: {
                    payload: Joi.object({
                        age: Joi.number().integer().min(1).max(120).required(),
                        gender: Joi.number().integer().valid(1, 2).required(),
                        height: Joi.number().integer().min(100).max(250).required(),
                        weight: Joi.number().integer().min(30).max(200).required(),
                        ap_hi: Joi.number().integer().min(80).max(250).required(),
                        ap_lo: Joi.number().integer().min(40).max(150).required(),
                        cholesterol: Joi.number().integer().valid(1, 2, 3).required(),
                        gluc: Joi.number().integer().valid(1, 2, 3).required(),
                        smoke: Joi.number().integer().valid(0, 1).required(),
                        alco: Joi.number().integer().valid(0, 1).required(),
                        active: Joi.number().integer().valid(0, 1).required()
                    })
                }
            },
            handler: async (request, h) => {
                try {
                    const inputData = request.payload;
                    console.log('📥 Received prediction request:', inputData);
                    
                    // Generate prediction with ML integration
                    const prediction = await predictCardiovascularRisk(inputData);
                    
                    // Save to Supabase with enhanced data
                    const predictionData = {
                        ...inputData,
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
                            age: inputData.age,
                            gender: inputData.gender === 2 ? 'Female' : 'Male',
                            height: inputData.height,
                            weight: inputData.weight,
                            bmi: prediction.bmi,
                            blood_pressure: `${inputData.ap_hi}/${inputData.ap_lo}`,
                            cholesterol: inputData.cholesterol === 1 ? 'Normal' : inputData.cholesterol === 2 ? 'Above Normal' : 'Well Above Normal',
                            glucose: inputData.gluc === 1 ? 'Normal' : inputData.gluc === 2 ? 'Above Normal' : 'Well Above Normal',
                            lifestyle: {
                                smoking: inputData.smoke === 1 ? 'Yes' : 'No',
                                alcohol: inputData.alco === 1 ? 'Yes' : 'No',
                                physical_activity: inputData.active === 1 ? 'Yes' : 'No'
                            }
                        },
                        ml_insights: prediction.ml_details || null,
                        saved: !error,
                        message: 'Prediction completed successfully'
                    };

                    console.log('📤 Sending prediction response:', response);
                    return h.response(response).code(200);

                } catch (error) {
                    console.error('❌ Prediction error:', error);
                    return h.response({
                        success: false,
                        error: 'Internal server error',
                        message: error.message,
                        prediction_source: 'error'
                    }).code(500);
                }
            }
        });

        // Get predictions endpoint
        server.route({
            method: 'GET',
            path: '/api/predictions',
            options: {
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
                    }).code(200);

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
                            male: data.filter(item => item.gender === 2).length,
                            female: data.filter(item => item.gender === 1).length
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
                    }).code(200);

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
