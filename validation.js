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
    content: Joi.string().max(100000).required(),
    location: Joi.object({
        latitude: Joi.any().required(),
        longitude: Joi.any().required()
    }).optional()
});

// --- Middleware Function ---

export const validate = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
        console.error("Validation Error:", error.details[0].message);
        return res.status(400).json({ error: error.details[0].message });
    }
    next();
}; 