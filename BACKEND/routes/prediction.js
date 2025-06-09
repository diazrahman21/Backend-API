const Joi = require('@hapi/joi');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Mock prediction function
function predictCardiovascularRisk(formData) {
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
        bmi: bmi.toFixed(1)
    };
}

module.exports = {
    name: 'prediction-routes',
    register: async function (server) {
        // Prediction endpoint
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
                    
                    // Generate prediction
                    const prediction = predictCardiovascularRisk(inputData);
                    
                    // Save to Supabase
                    const predictionData = {
                        ...inputData,
                        risk_prediction: prediction.risk,
                        confidence_score: prediction.confidence,
                        probability: prediction.probability,
                        bmi: parseFloat(prediction.bmi),
                        prediction_source: 'hapi_api',
                        user_agent: request.headers['user-agent'] || null,
                        session_id: `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
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

                    console.log('📤 Sending prediction response:', prediction);
                    return h.response({
                        success: true,
                        prediction,
                        saved: !error,
                        message: 'Prediction completed successfully'
                    }).code(200);

                } catch (error) {
                    console.error('❌ Prediction error:', error);
                    return h.response({
                        success: false,
                        error: 'Internal server error',
                        message: error.message
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
