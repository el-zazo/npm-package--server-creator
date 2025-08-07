/**
 * Export all utility functions
 */

const tokenUtils = require("./token");
const passwordUtils = require("./password");
const constants = require("./constants");
const errors = require("./errors");
const { MODEL } = require("./constants");

/**
 * Parse sort parameter from query string
 * Supports two formats:
 * 1. JSON string: {"field1": 1, "field2": -1}
 * 2. URL-friendly string: field1:1,field2:-1
 *
 * @param {string} sortParam - Sort parameter from query string
 * @returns {Object} - Sort object for MongoDB
 * @throws {Error} - If parsing fails
 */
function parseSortParameter(sortParam) {
  if (!sortParam) return {};

  // Try to parse as JSON first
  try {
    return JSON.parse(sortParam);
  } catch {
    // If JSON parsing fails, try the string format
    const sortObject = {};
    const sortParams = sortParam.split(",");

    sortParams.forEach((param) => {
      const [field, order] = param.split(":");
      if (field && order) {
        sortObject[field] = parseInt(order) || 1; // Default to ascending if parsing fails
      }
    });

    return sortObject;
  }
}

/**
 * Create pagination metadata for list endpoints
 *
 * @param {Object} options - Pagination options
 * @param {number} options.page - Current page number
 * @param {number} options.per_page - Items per page
 * @param {number} options.total - Total number of items
 * @returns {Object} - Pagination metadata
 */
function createPaginationMetadata(options) {
  // Extract pagination parameters with defaults
  const page = options.page || MODEL.PAGINATION.DEFAULT_PAGE;
  const perPage = options.per_page || MODEL.PAGINATION.DEFAULT_PER_PAGE;
  const total = options.total || 0;

  // Calculate pagination metadata
  const totalPages = perPage > 0 ? Math.ceil(total / perPage) : 1;
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    total,
    total_pages: totalPages,
    current_page: page,
    per_page: perPage,
    has_next_page: hasNextPage,
    has_prev_page: hasPrevPage,
    next_page: hasNextPage ? page + 1 : null,
    prev_page: hasPrevPage ? page - 1 : null,
  };
}

/**
 * Parse field selection parameter from query string or object
 * Supports three formats:
 * 1. JSON string: {"field1": 1, "field2": 0}
 * 2. URL-friendly string: field1,field2,-field3
 *    - Fields without prefix are included
 *    - Fields with '-' prefix are excluded
 * 3. Direct object: { field1: 1, field2: 0 }
 *
 * @param {string|Object} fieldsParam - Fields parameter from query string or request body
 * @returns {Object|null} - Fields selection object with format { fieldName: 0|1 }
 * @throws {Error} - If parsing fails or validation fails
 */
function parseFieldsParameter(fieldsParam) {
  if (!fieldsParam) return null;

  // If already an object, validate and return
  if (typeof fieldsParam === "object" && !Array.isArray(fieldsParam)) {
    return validateFieldsObject(fieldsParam);
  }

  // Handle string input
  if (typeof fieldsParam === "string") {
    // Try to parse as JSON first
    try {
      const parsedObject = JSON.parse(fieldsParam);
      return validateFieldsObject(parsedObject);
    } catch {
      // If JSON parsing fails, try the URL-friendly string format
      const fieldsObject = {};
      const fieldsList = fieldsParam.split(",").filter((field) => field.trim());

      fieldsList.forEach((field) => {
        const trimmedField = field.trim();
        if (trimmedField.startsWith("-")) {
          // Fields with '-' prefix are excluded
          fieldsObject[trimmedField.substring(1)] = 0;
        } else {
          // Fields without prefix are included
          fieldsObject[trimmedField] = 1;
        }
      });

      return fieldsObject;
    }
  }

  // If we get here, the input format is invalid
  throw new Error("Invalid fields parameter format. Must be a string or object.");
}

/**
 * Validate fields object to ensure it only contains 0 or 1 values
 * @param {Object} fieldsObject - The fields object to validate
 * @returns {Object} - The validated fields object
 * @throws {Error} - If validation fails
 */
function validateFieldsObject(fieldsObject) {
  if (!fieldsObject || typeof fieldsObject !== "object" || Array.isArray(fieldsObject)) {
    throw new Error("Fields must be an object with field names as keys and 0 or 1 as values");
  }

  // Create a new object with validated values
  const validatedFields = {};

  Object.entries(fieldsObject).forEach(([field, value]) => {
    // Convert string values '0' and '1' to numbers
    if (["0", "1"].includes(value)) value = parseInt(value);

    // Ensure values are only 0 or 1
    if (value !== 0 && value !== 1) {
      throw new Error(`Invalid value for field '${field}'. Must be 0 or 1.`);
    }

    validatedFields[field] = value;
  });

  return validatedFields;
}

/**
 * Merge collection fields configuration with request fields
 *
 * @param {Object|null} requestFields - Fields from request query parameter
 * @param {Object|null} collectionFields - Fields configuration from collection options
 * @returns {Object|null} - Merged fields object
 */
function mergeFieldsConfiguration(requestFields, collectionFields) {
  // If no collection fields config and no request fields, return null (get all fields)
  if (!collectionFields && !requestFields) return null;

  // If only request fields provided, use them
  if (requestFields && !collectionFields) return requestFields;

  // If only collection fields provided, use them
  if (!requestFields && collectionFields) return collectionFields;

  // Both are provided, merge them with request fields taking precedence
  // Start with collection fields
  const mergedFields = { ...collectionFields };

  // Apply request fields (overriding collection fields)
  Object.entries(requestFields).forEach(([field, value]) => {
    // If collection field is 0, skip it
    if (collectionFields?.[field] === 0) return;

    // If collection field is 1, apply the request field
    mergedFields[field] = value;
  });

  return mergedFields;
}

module.exports = {
  // Core utility functions
  parseSortParameter,
  createPaginationMetadata,
  parseFieldsParameter,
  mergeFieldsConfiguration,

  // Re-export other utility modules
  ...tokenUtils,
  ...passwordUtils,
  ...errors,
  ...constants,
};
