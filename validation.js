// The definitive, final, and correct validation.js for Hbuk

import Joi from 'joi';

// --- Schemas ---

export const registerSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
});

export const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

export const entrySchema = Joi.object({
    content: Joi.string().min(1).max(65535).required(),
    // Optional location fields - explicitly whitelisted
    latitude: Joi.number().min(-90).max(90).precision(6).optional(),
    longitude: Joi.number().min(-180).max(180).precision(6).optional(),
    locationName: Joi.string().trim().max(120).optional()
});

// --- Middleware Function ---

export const validate = (schema) => (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true, // drop any unexpected fields - keep this for security
    });
    if (error) {
        console.error("Validation Error:", error.details[0].message);
        return res.status(400).json({ error: error.details[0].message });
    }
    req.body = value; // use the cleaned, validated body
    next();
}; 