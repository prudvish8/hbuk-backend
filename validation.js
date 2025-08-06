const Joi = require('joi');

// Validation schemas
const registerSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

const entrySchema = Joi.object({
    text: Joi.string().max(1000).required(),
    location: Joi.object({
        latitude: Joi.any().required(),
        longitude: Joi.any().required()
    }).optional(),
    locationName: Joi.string().max(200).optional()
});

// Validation middleware functions
const validateRegister = (req, res, next) => {
    const { error } = registerSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ 
            message: "Invalid input data", 
            details: error.details[0].message 
        });
    }
    next();
};

const validateLogin = (req, res, next) => {
    const { error } = loginSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ 
            message: "Invalid input data", 
            details: error.details[0].message 
        });
    }
    next();
};

const validateEntry = (req, res, next) => {
    const { error } = entrySchema.validate(req.body);
    if (error) {
        return res.status(400).json({ 
            message: "Invalid input data", 
            details: error.details[0].message 
        });
    }
    next();
};

module.exports = {
    validateRegister,
    validateLogin,
    validateEntry
}; 