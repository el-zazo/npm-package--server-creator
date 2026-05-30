/**
 * CRUD route handlers for Router class
 */
const { HTTP_STATUS, ERROR_MESSAGES } = require("../utils/constants");
const { ValidationError, logger, parseSortParameter, sanitizeSortFields, mergeFieldsConfiguration } = require("../utils");
const { MODEL } = require("../utils/constants");
const { createPaginationMetadata, parseFieldsParameter } = require("../utils");

const SENSITIVE_FIELDS = ["password", "passwordConfirm", "token", "secret", "key"];
const NO_PAGINATION_OPTIONS = ["true", "True", "1"];

/**
 * Remove dangerous NoSQL operators that could allow arbitrary code execution
 * or bypass intended logic.
 */
const DANGEROUS_OPERATORS = [
  "$where", "$expr", "$function", "$accumulator",
  "$regex", "$jsonSchema", "$natural", "$text",
  "$geoIntersects", "$geoNear", "$near", "$nearSphere",
  "$search", "$regexMatch", "$all", "$elemMatch",
  "$options", "$slice", "$meta", "$comment"
];

const sanitizeNoSQL = (obj) => {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeNoSQL);
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (DANGEROUS_OPERATORS.includes(key)) {
      continue;
    }
    sanitized[key] = sanitizeNoSQL(value);
  }
  return sanitized;
};

/**
 * Recursively check if a filter object is effectively empty.
 * Catches:
 *  - {} (empty object)
 *  - { or: [] } / { and: [] } (empty arrays)
 *  - { or: [{}] } / { and: [{}] } (arrays of empty objects)
 *  - { $or: [{}] } / { $and: [{}] } (already-normalized forms)
 *  - Nested combinations like { and: [{ or: [{}] }] }
 *
 * @param {Object} filter - The filter object to check
 * @returns {Boolean} - True if the filter is effectively empty (matches all docs)
 */
const isFilterEffectivelyEmpty = (filter) => {
  if (!filter || typeof filter !== "object") return true;
  if (Array.isArray(filter)) {
    return filter.length === 0 || filter.every((item) => isFilterEffectivelyEmpty(item));
  }
  const keys = Object.keys(filter);
  if (keys.length === 0) return true;
  // Check if ALL keys are or/and/$or/$and with effectively empty content
  for (const key of keys) {
    const val = filter[key];
    if ((key === "or" || key === "$or" || key === "and" || key === "$and") && Array.isArray(val)) {
      // If any item in the array is NOT effectively empty, the filter has real constraints
      if (val.length > 0 && !val.every((item) => isFilterEffectivelyEmpty(item))) {
        return false;
      }
      // Array is empty or all items are effectively empty — this key is empty,
      // continue checking other keys
    } else {
      // Any key that isn't or/and/$or/$and means the filter has real constraints
      return false;
    }
  }
  // All keys were or/and/$or/$and with effectively empty content
  return true;
};

/**
 * Sensitive field names that must never be explicitly selected (included) via
 * the ?fields= query parameter. If any of these appear with value 1 in the
 * parsed fields object, they are forced to 0 (excluded). This prevents
 * attackers from bypassing sanitizeDocument by explicitly requesting
 * password hashes, tokens, etc.
 *
 * Also strips any key starting with "$" to prevent MongoDB operator injection
 * through the fields projection object.
 */
const FORBIDDEN_SELECT_FIELDS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "salt",
  "secret",
  "token",
  "refreshtoken",
  "__v",
]);

const sanitizeFieldsParam = (fields) => {
  if (!fields || typeof fields !== "object") return fields;

  const sanitized = {};
  for (const [key, value] of Object.entries(fields)) {
    // Block any key starting with $ (MongoDB operator injection)
    if (key.startsWith("$")) continue;

    // Force sensitive fields to always be excluded (0), never included (1)
    // Case-insensitive check for consistency with sanitizeSortFields
    if (FORBIDDEN_SELECT_FIELDS.has(key.toLowerCase())) {
      sanitized[key] = 0;
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
};

/**
 * Maximum number of documents allowed in a single addMany batch request.
 * Prevents memory exhaustion and DoS via oversized payloads.
 */
const MAX_BATCH_SIZE = 500;

const sanitizeBody = (body) => {
  const sanitized = { ...body };
  SENSITIVE_FIELDS.forEach((field) => {
    if (sanitized[field]) sanitized[field] = "***";
  });
  return sanitized;
};

/**
 * Sensitive fields to strip from response documents
 * (password hashes, version keys, etc.)
 */
const RESPONSE_SENSITIVE_FIELDS = ["password", "passwordHash", "__v"];

/**
 * Remove sensitive fields from a document before sending it in a response.
 * Handles both Mongoose documents (with toObject()) and plain objects/Sequelize instances.
 * Recursively sanitizes nested objects and arrays.
 * @param {Object} doc - Document to sanitize
 * @param {Array} extraSensitiveFields - Additional field names to strip (e.g. custom passwordKey)
 * @returns {Object} - Sanitized document with sensitive fields removed
 */
const sanitizeDocument = (doc, extraSensitiveFields = []) => {
  // Use lowercase comparison for built-in sensitive fields (consistency with
  // sanitizeSortFields), but keep extraSensitiveFields (user-specified password
  // key etc.) as exact-match since the user controls the exact field name.
  const lowerSensitiveFields = RESPONSE_SENSITIVE_FIELDS.map((f) => f.toLowerCase());
  if (!doc) return doc;
  const deepSanitize = (obj) => {
    if (typeof obj !== "object" || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(deepSanitize);
    if (Buffer.isBuffer(obj)) return obj;
    if (typeof obj.toJSON === "function") return obj.toJSON();
    return Object.keys(obj).reduce((acc, key) => {
      const keyLower = key.toLowerCase();
      const isBuiltInSensitive = lowerSensitiveFields.includes(keyLower);
      const isExtraSensitive = extraSensitiveFields.includes(key);
      if (!isBuiltInSensitive && !isExtraSensitive) {
        acc[key] = deepSanitize(obj[key]);
      }
      return acc;
    }, {});
  };
  if (doc.toObject) return deepSanitize(doc.toObject());
  if (doc.get && typeof doc.get === "function") return deepSanitize(doc.get({ plain: true }));
  return deepSanitize({ ...doc });
};

/**
 * GET /{model} - Get all documents
 */
async function getAll(req, res, next, model, router) {
  try {
    logger("info", "Getting all documents", { collection: model.modelName });

    const options = {
      sort: {},
    };

    // Check if no_pagination parameter is set to true
    const noPagination = NO_PAGINATION_OPTIONS.includes(req.query.no_pagination);

    if (!noPagination) {
      // Process pagination parameters
      const page = req.query.page ? parseInt(req.query.page, 10) : MODEL.PAGINATION.DEFAULT_PAGE;
      const perPage = req.query.per_page ? parseInt(req.query.per_page, 10) : MODEL.PAGINATION.DEFAULT_PER_PAGE;

      // Ensure per_page doesn't exceed the maximum
      const limitedPerPage = Math.min(perPage, MODEL.PAGINATION.MAX_PER_PAGE);

      // Calculate skip based on page and per_page if provided, otherwise use skip directly
      const skip = (page - 1) * limitedPerPage;

      options.limit = limitedPerPage;
      options.skip = skip;
    }

    // Parse sort parameter using the utility function
    if (req.query.sort) {
      try {
        options.sort = parseSortParameter(req.query.sort);
      } catch (parseError) {
        throw new ValidationError("Invalid sort parameter format", {
          details: "Use format 'field1:1,field2:-1' or valid JSON",
        });
      }
    }

    // Parse fields parameter for field selection
    let requestFields = null;
    if (req.query.fields) {
      try {
        requestFields = parseFieldsParameter(req.query.fields);
      } catch (parseError) {
        throw new ValidationError("Invalid fields parameter format", {
          details: 'Use format \'field1,field2,-field3\' or valid JSON like {"field1": 1, "field2": 0}',
        });
      }
    }

    // Sanitize request fields to prevent selecting sensitive fields
    const safeFields = sanitizeFieldsParam(requestFields);

    // Merge request fields with collection fields configuration from router
    const collectionFields = router?.fieldsConfig || null;
    options.fields = mergeFieldsConfiguration(safeFields, collectionFields);

    // Get total count for metadata
    const countQuery = {}; // Empty query to count all documents
    const total = await model.count(countQuery);

    // Get documents with or without pagination
    const documents = await model.getAll(options);

    logger("debug", "Retrieved all documents", { count: documents.length, collection: model.modelName });

    const response = {
      success: true,
      data: documents.map((doc) => sanitizeDocument(doc, [router?.auth?.keys?.passwordKey].filter(Boolean))),
    };

    // Add pagination metadata if pagination is enabled
    if (!noPagination) {
      const pagination = createPaginationMetadata({
        page: options.skip ? Math.floor(options.skip / options.limit) + 1 : 1,
        per_page: options.limit,
        total,
      });
      response.pagination = pagination;
    } else {
      response.total = total;
    }

    res.json(response);
  } catch (error) {
    if (error.name === "SyntaxError") {
      return next(new ValidationError("Invalid JSON in query parameters", { details: error.message }));
    }
    next(error);
  }
}

/**
 * GET /{model}/:id - Get document by ID
 */
async function getOneById(req, res, next, model, router) {
  try {
    const { id } = req.params;
    const options = {};

    // Parse fields parameter for field selection
    let requestFields = null;
    if (req.query.fields) {
      try {
        requestFields = parseFieldsParameter(req.query.fields);
      } catch (parseError) {
        throw new ValidationError("Invalid fields parameter format", {
          details: 'Use format \'field1,field2,-field3\' or valid JSON like {"field1": 1, "field2": 0}',
        });
      }
    }

    // Sanitize request fields to prevent selecting sensitive fields
    const safeFields = sanitizeFieldsParam(requestFields);

    // Merge request fields with collection fields configuration from router
    const collectionFields = router?.fieldsConfig || null;
    options.fields = mergeFieldsConfiguration(safeFields, collectionFields);

    logger("info", "Getting document by ID", { id, collection: model.modelName });

    const document = await model.getOneById(id, options);

    logger("debug", "Retrieved document by ID", { id, collection: model.modelName });

    res.json({
      success: true,
      data: sanitizeDocument(document, [router?.auth?.keys?.passwordKey].filter(Boolean)),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /{model}/search - Get documents by query
 */
async function search(req, res, next, model, router) {
  try {
    const query = sanitizeNoSQL(req.body.query) || {};

    // Strip sensitive fields from query to prevent blind NoSQL injection
    const sensitiveFields = [...RESPONSE_SENSITIVE_FIELDS, router?.auth?.keys?.passwordKey].filter(Boolean).map(f => f.toLowerCase());
    Object.keys(query).forEach(key => {
      if (sensitiveFields.includes(key.toLowerCase())) delete query[key];
    });

    // Check if no_pagination parameter is set to true (supports boolean and string representations)
    const noPagination = req.body.no_pagination === true || ["true", "True", "TRUE", "1"].includes(String(req.body.no_pagination));

    const options = {
      sort: sanitizeSortFields(req.body.sort) || {},
    };

    if (!noPagination) {
      // Process pagination parameters
      const page = req.body.page ? parseInt(req.body.page, 10) : MODEL.PAGINATION.DEFAULT_PAGE;
      const perPage = req.body.per_page ? parseInt(req.body.per_page, 10) : MODEL.PAGINATION.DEFAULT_PER_PAGE;

      // Ensure per_page doesn't exceed the maximum
      const limitedPerPage = Math.min(perPage, MODEL.PAGINATION.MAX_PER_PAGE);

      // Calculate skip
      const skip = (page - 1) * limitedPerPage;

      options.limit = limitedPerPage;
      options.skip = skip;
    }

    // Parse fields parameter for field selection
    let requestFields = null;
    if (req.body.fields) {
      try {
        requestFields = parseFieldsParameter(req.body.fields);
      } catch (parseError) {
        throw new ValidationError(ERROR_MESSAGES.INVALID_FIELDS_PARAMETER_FORMAT, {
          details: 'Use format \'field1,field2,-field3\' or valid JSON like {"field1": 1, "field2": 0}',
        });
      }
    }

    // Sanitize request fields to prevent selecting sensitive fields
    const safeFields = sanitizeFieldsParam(requestFields);

    // Merge request fields with collection fields configuration from router
    const collectionFields = router?.fieldsConfig || null;
    options.fields = mergeFieldsConfiguration(safeFields, collectionFields);

    logger("info", "Searching documents", { query, options, collection: model.modelName });

    // Get total count for metadata
    const total = await model.count(query);

    // Get documents with or without pagination
    const documents = await model.getMany(query, options);

    logger("debug", "Search results", { count: documents.length, collection: model.modelName });

    const response = {
      success: true,
      data: documents.map((doc) => sanitizeDocument(doc, [router?.auth?.keys?.passwordKey].filter(Boolean))),
    };

    // Add pagination metadata if pagination is enabled
    if (!noPagination) {
      const pagination = createPaginationMetadata({
        page: options.skip ? Math.floor(options.skip / options.limit) + 1 : 1,
        per_page: options.limit,
        total,
      });
      response.pagination = pagination;
    } else {
      response.total = total;
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /{model} - Add one document
 */
async function addOne(req, res, next, model, router) {
  try {
    // Validate request body
    if (!req.body || Object.keys(req.body).length === 0) {
      throw new ValidationError("Request body is required");
    }

    logger("info", "Adding new document", { collection: model.modelName, body: sanitizeBody(req.body) });

    const document = await model.addOne(req.body);

    logger("debug", "Document created successfully", { id: document._id || document.id, collection: model.modelName });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: sanitizeDocument(document, [router?.auth?.keys?.passwordKey].filter(Boolean)),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /{model}/many - Add many documents
 */
async function addMany(req, res, next, model, router) {
  try {
    // Validate request body
    if (!req.body || !Array.isArray(req.body)) {
      throw new ValidationError(ERROR_MESSAGES.REQUEST_BODY_MUST_BE_ARRAY);
    }

    if (req.body.length === 0) {
      throw new ValidationError(ERROR_MESSAGES.REQUEST_BODY_MUST_BE_NOT_EMPTY);
    }

    if (req.body.length > MAX_BATCH_SIZE) {
      throw new ValidationError(
        `Batch size exceeds maximum allowed limit of ${MAX_BATCH_SIZE}. ` +
        `Received: ${req.body.length} documents. Please split into smaller batches.`
      );
    }

    logger("info", "Adding multiple documents", { count: req.body.length, collection: model.modelName });

    const documents = await model.addMany(req.body);

    logger("debug", "Multiple documents created successfully", { count: documents.length, collection: model.modelName });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: documents.map((doc) => sanitizeDocument(doc, [router?.auth?.keys?.passwordKey].filter(Boolean))),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /{model}/:id - Update document by ID
 */
async function updateOneById(req, res, next, model, router) {
  try {
    const { id } = req.params;

    const sanitizedBody = sanitizeNoSQL(req.body);
    if (!sanitizedBody || Object.keys(sanitizedBody).length === 0) {
      throw new ValidationError(ERROR_MESSAGES.UPDATE_DATA_REQUIRED);
    }

    logger("info", "Updating document by ID", { id, collection: model.modelName });

    const passwordKey = router?.auth?.keys?.passwordKey || "password";
    if (sanitizedBody[passwordKey]) {
      const { hashPassword } = require("../utils/password");
      sanitizedBody[passwordKey] = await hashPassword(sanitizedBody[passwordKey], router?.auth?.usePasswordHash !== false);
    }

    const document = await model.updateOneById(id, sanitizedBody);

    logger("debug", "Document updated successfully", { id, collection: model.modelName });

    res.json({
      success: true,
      data: sanitizeDocument(document, [router?.auth?.keys?.passwordKey].filter(Boolean)),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /{model}/many - Update many documents by filter
 */
async function updateMany(req, res, next, model, router) {
  try {
    if (!req.body.filter) {
      throw new ValidationError(ERROR_MESSAGES.FILTER_REQUIRED);
    }

    if (!req.body.update) {
      throw new ValidationError(ERROR_MESSAGES.UPDATE_DATA_REQUIRED_IN_BODY);
    }

    const filter = sanitizeNoSQL(req.body.filter);
    const update = sanitizeNoSQL(req.body.update);

    // Check if filter is effectively empty (would match all documents)
    if (isFilterEffectivelyEmpty(filter)) {
      throw new ValidationError(ERROR_MESSAGES.EMPTY_FILTER_NOT_ALLOWED);
    }

    if (Object.keys(update).length === 0) {
      throw new ValidationError(ERROR_MESSAGES.UPDATE_DATA_REQUIRED);
    }

    logger("info", "Updating multiple documents by filter", { filter, collection: model.modelName });

    const passwordKey = router?.auth?.keys?.passwordKey || "password";
    if (update[passwordKey]) {
      const { hashPassword } = require("../utils/password");
      update[passwordKey] = await hashPassword(update[passwordKey], router?.auth?.usePasswordHash !== false);
    }

    const result = await model.updateManyByFilter(filter, update);

    logger("debug", "Multiple documents updated successfully", { count: result.affectedCount, collection: model.modelName });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /{model}/:id - Delete document by ID
 */
async function deleteById(req, res, next, model, router) {
  try {
    const { id } = req.params;

    logger("info", "Deleting document by ID", { id, collection: model.modelName });

    const document = await model.deleteOneById(id);

    logger("debug", "Document deleted successfully", { id, collection: model.modelName });

    res.json({
      success: true,
      data: sanitizeDocument(document, [router?.auth?.keys?.passwordKey].filter(Boolean)),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /{model}/many - Delete many documents by filter
 */
async function deleteMany(req, res, next, model, router) {
  try {
    // Check if filter exists
    if (!req?.body?.filter) {
      throw new ValidationError(ERROR_MESSAGES.FILTER_REQUIRED);
    }

    const filter = sanitizeNoSQL(req.body.filter);

    // Security check to prevent deleting all data
    if (isFilterEffectivelyEmpty(filter)) {
      throw new ValidationError(ERROR_MESSAGES.EMPTY_FILTER_NOT_ALLOWED);
    }

    logger("info", "Deleting multiple documents by filter", { filter, collection: model.modelName });

    const result = await model.deleteManyByFilter(filter);

    logger("debug", "Multiple documents deleted successfully", { count: result.deletedCount, collection: model.modelName });

    // Sanitize deleted documents if present in result (prevents password leaks)
    if (Array.isArray(result.data)) {
      result.data = result.data.map((doc) => sanitizeDocument(doc, [router?.auth?.keys?.passwordKey].filter(Boolean)));
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAll,
  getOneById,
  search,
  addOne,
  addMany,
  updateOneById,
  updateMany,
  deleteById,
  deleteMany,
  sanitizeDocument,
};
