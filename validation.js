// The definitive, final, and correct validation.js for Hbuk

const Joi = require('joi');

// --- Schemas ---

const registerSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

const entrySchema = Joi.object({
    text: Joi.string().max(10000).required(),
    timestamp: Joi.string().isoDate().required(),
    location: Joi.object({
        latitude: Joi.any().required(),
        longitude: Joi.any().required()
    }).optional(),
    locationName: Joi.string().max(200).allow('').optional()
});

// --- Middleware Function ---

const validate = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
        console.error("Validation Error:", error.details[0].message);
        return res.status(400).json({ message: error.details[0].message });
    }
    next();
};

// --- CRITICAL FIX: THE EXPORTS ---
module.exports = {
    validate,
    registerSchema,
    loginSchema,
    entrySchema
}; 