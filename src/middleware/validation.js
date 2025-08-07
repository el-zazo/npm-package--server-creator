/**
 * Input validation middleware using Joi
 */
const Joi = require("joi");
const { ValidationError } = require("../utils/errors");
const { MODEL } = require("../utils/constants");

/**
 * Create validation middleware for request components
 * @param {Object} schema - Joi schema for validation
 * @param {String} property - Request property to validate (body, params, query)
 * @returns {Function} - Express middleware function
 */
const validate = (schema, property = "body") => {
  return (req, res, next) => {
    if (!schema) return next();

    // Use empty object as fallback if property is undefined
    const dataToValidate = req[property] || {};
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false, // Return all errors, not just the first one
      stripUnknown: true, // Remove unknown properties
      errors: { label: "key" }, // Show the key name in error messages
    });

    if (error) {
      // Format validation errors
      const details = {};
      const errorMessages = [];

      error.details.forEach((detail) => {
        const path = detail.path.join(".");
        errorMessages.push(`${path}: ${detail.message}`);

        if (!details.fields) {
          details.fields = {};
        }
        details.fields[path] = detail.message;
      });

      return next(new ValidationError(`Validation error: ${errorMessages.join(", ")}`, details));
    }

    // Replace request data with validated data
    req[property] = value;
    next();
  };
};

/**
 * Validation schemas for different routes
 */
const schemas = {
  // Authentication schemas
  auth: {
    // Dynamic login schema creation function
    getLoginSchema: (identifiantKey = "email", passwordKey = "password") => {
      const schema = {};
      schema[identifiantKey] = Joi.string().required();
      schema[passwordKey] = Joi.string().required();

      // Add email validation if the identifiant key is 'email'
      if (identifiantKey === "email") {
        schema[identifiantKey] = Joi.string().email().required();
      }

      return Joi.object(schema);
    },

    // Dynamic register schema creation function
    getRegisterSchema: (identifiantKey = "email", passwordKey = "password", additionalFields = {}) => {
      const schema = {};
      schema[identifiantKey] = Joi.string().required();
      schema[passwordKey] = Joi.string().min(6).required();

      // Add email validation if the identifiant key is 'email'
      if (identifiantKey === "email") {
        schema[identifiantKey] = Joi.string().email().required();
      }

      // Merge additional dynamic fields
      Object.assign(schema, additionalFields);

      return Joi.object(schema);
    },

    // Default schemas using default keys
    login: null, // Will be set in the Router
    register: null, // Will be set in the Router

    // Token refresh schema
    refreshToken: Joi.object({
      token: Joi.string().required(),
    }),
  },

  // CRUD operation schemas
  crud: {
    // Get all - query parameters
    getAll: Joi.object({
      sort: Joi.string(),
      page: Joi.number().integer().min(1),
      per_page: Joi.number().integer().min(1).max(MODEL.PAGINATION.MAX_PER_PAGE),
      fields: Joi.string().optional(),
      no_pagination: Joi.boolean().default(false),
    }),

    // Get by ID - params
    getOneById: Joi.object({
      id: Joi.alternatives()
        .try(
          Joi.string().pattern(/^[0-9a-fA-F]{24}$/), // MongoDB ObjectId
          Joi.number().integer(), // MySQL ID
          Joi.string() // Other ID formats
        )
        .required(),
      fields: Joi.string().optional(),
    }),

    // Search - body
    search: Joi.object({
      query: Joi.object().optional().default({}),
      sort: Joi.object().optional().default({}),
      fields: Joi.alternatives()
        .try(Joi.object().pattern(Joi.string(), Joi.number().valid(0, 1)), Joi.string())
        .optional(),
      page: Joi.number().integer().min(1).optional().default(MODEL.PAGINATION.DEFAULT_PAGE),
      per_page: Joi.number().integer().min(1).max(MODEL.PAGINATION.MAX_PER_PAGE).optional().default(MODEL.PAGINATION.DEFAULT_PER_PAGE),
      no_pagination: Joi.boolean().default(false),
    }),

    // Add one - body
    addOne: Joi.object().min(1).required(),

    // Add many - body
    addMany: Joi.array().items(Joi.object().min(1)).min(1).required(),

    // Update by ID - params
    updateOneByIdParams: Joi.object({
      id: Joi.alternatives()
        .try(
          Joi.string().pattern(/^[0-9a-fA-F]{24}$/), // MongoDB ObjectId
          Joi.number().integer(), // MySQL ID
          Joi.string() // Other ID formats
        )
        .required(),
    }),

    // Update by ID - body
    updateOneByIdBody: Joi.object().min(1).required(),

    // Update many - body
    updateMany: Joi.object({
      filter: Joi.object().required().min(1),
      update: Joi.object().required().min(1),
    }),

    // Delete by ID - params
    deleteById: Joi.object({
      id: Joi.alternatives()
        .try(
          Joi.string().pattern(/^[0-9a-fA-F]{24}$/), // MongoDB ObjectId
          Joi.number().integer(), // MySQL ID
          Joi.string() // Other ID formats
        )
        .required(),
    }),

    // Delete many - body
    deleteMany: Joi.object({
      filter: Joi.object().required().min(1),
    }),
  },
};

module.exports = {
  validate,
  schemas,
};
