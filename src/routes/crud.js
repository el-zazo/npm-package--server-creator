/**
 * CRUD route handlers for Router class
 */
const { HTTP_STATUS, ERROR_MESSAGES } = require("../utils/constants");
const { ValidationError, logger, parseSortParameter, mergeFieldsConfiguration } = require("../utils");
const { MODEL } = require("../utils/constants");
const { createPaginationMetadata, parseFieldsParameter } = require("../utils");

/**
 * GET /{model} - Get all documents
 */
async function getAll(req, res, next, model) {
  try {
    logger("info", "Getting all documents", { collection: model.modelName });

    const options = {
      sort: {},
    };

    // Check if no_pagination parameter is set to true
    const noPagination = req.query.no_pagination === "true";

    if (!noPagination) {
      // Process pagination parameters
      const page = req.query.page ? parseInt(req.query.page) : MODEL.PAGINATION.DEFAULT_PAGE;
      const perPage = req.query.per_page ? parseInt(req.query.per_page) : MODEL.PAGINATION.DEFAULT_PER_PAGE;

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

    // Merge request fields with collection fields configuration from router
    // The router passes itself as the 5th parameter to route handlers
    const collectionFields = arguments[4]?.fieldsConfig || null;
    options.fields = mergeFieldsConfiguration(requestFields, collectionFields);

    // Get total count for metadata
    const countQuery = {}; // Empty query to count all documents
    const total = await model.count(countQuery);

    // Get documents with or without pagination
    const documents = await model.getAll(options);

    logger("debug", "Retrieved all documents", { count: documents.length, collection: model.modelName });

    const response = {
      success: true,
      data: documents,
    };

    // Add pagination metadata if pagination is enabled
    if (!noPagination) {
      const pagination = createPaginationMetadata({
        page: options.skip ? options.skip / options.limit + 1 : 1,
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
async function getOneById(req, res, next, model) {
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

    // Merge request fields with collection fields configuration from router
    // The router passes itself as the 5th parameter to route handlers
    const collectionFields = arguments[4]?.fieldsConfig || null;
    options.fields = mergeFieldsConfiguration(requestFields, collectionFields);

    logger("info", "Getting document by ID", { id, collection: model.modelName });

    const document = await model.getOneById(id, options);

    logger("debug", "Retrieved document by ID", { id, collection: model.modelName });

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /{model}/search - Get documents by query
 */
async function search(req, res, next, model) {
  try {
    const query = req.body.query || {};

    // Check if no_pagination parameter is set to true
    const noPagination = req.body.no_pagination === true;

    const options = {
      sort: req.body.sort || {},
    };

    if (!noPagination) {
      // Process pagination parameters
      const page = req.body.page ? parseInt(req.body.page) : MODEL.PAGINATION.DEFAULT_PAGE;
      const perPage = req.body.per_page ? parseInt(req.body.per_page) : MODEL.PAGINATION.DEFAULT_PER_PAGE;

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

    // Merge request fields with collection fields configuration from router
    // The router passes itself as the 5th parameter to route handlers
    const collectionFields = arguments[4]?.fieldsConfig || null;
    options.fields = mergeFieldsConfiguration(requestFields, collectionFields);

    logger("info", "Searching documents", { query, options, collection: model.modelName });

    // Get total count for metadata
    const total = await model.count(query);

    // Get documents with or without pagination
    const documents = await model.getMany(query, options);

    logger("debug", "Search results", { count: documents.length, collection: model.modelName });

    const response = {
      success: true,
      data: documents,
    };

    // Add pagination metadata if pagination is enabled
    if (!noPagination) {
      const pagination = createPaginationMetadata({
        page: options.skip ? options.skip / options.limit + 1 : 1,
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
async function addOne(req, res, next, model) {
  try {
    // Validate request body
    if (!req.body || Object.keys(req.body).length === 0) {
      throw new ValidationError("Request body is required");
    }

    logger("info", "Adding new document", { collection: model.modelName, body: req.body });

    const document = await model.addOne(req.body);

    logger("debug", "Document created successfully", { id: document._id, collection: model.modelName });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /{model}/many - Add many documents
 */
async function addMany(req, res, next, model) {
  try {
    // Validate request body
    if (!req.body || !Array.isArray(req.body)) {
      throw new ValidationError(ERROR_MESSAGES.REQUEST_BODY_MUST_BE_ARRAY);
    }

    if (req.body.length === 0) {
      throw new ValidationError(ERROR_MESSAGES.REQUEST_BODY_MUST_BE_NOT_EMPTY);
    }

    logger("info", "Adding multiple documents", { count: req.body.length, collection: model.modelName });

    const documents = await model.addMany(req.body);

    logger("debug", "Multiple documents created successfully", { count: documents.length, collection: model.modelName });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: documents,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /{model}/:id - Update document by ID
 */
async function updateOneById(req, res, next, model) {
  try {
    const { id } = req.params;

    if (!req.body || Object.keys(req.body).length === 0) {
      throw new ValidationError(ERROR_MESSAGES.UPDATE_DATA_REQUIRED);
    }

    logger("info", "Updating document by ID", { id, collection: model.modelName });

    const document = await model.updateOneById(id, req.body);

    logger("debug", "Document updated successfully", { id, collection: model.modelName });

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /{model}/many - Update many documents by filter
 */
async function updateMany(req, res, next, model) {
  try {
    if (!req.body.filter) {
      throw new ValidationError(ERROR_MESSAGES.FILTER_REQUIRED);
    }

    if (!req.body.update) {
      throw new ValidationError(ERROR_MESSAGES.UPDATE_DATA_REQUIRED_IN_BODY);
    }

    // Check if filter is empty object {} which would match all documents
    if (Object.keys(req.body.filter).length === 0) {
      throw new ValidationError(ERROR_MESSAGES.EMPTY_FILTER_NOT_ALLOWED);
    }

    if (Object.keys(req.body.update).length === 0) {
      throw new ValidationError(ERROR_MESSAGES.UPDATE_DATA_REQUIRED);
    }

    logger("info", "Updating multiple documents by filter", { filter: req.body.filter, collection: model.modelName });

    const result = await model.updateManyByFilter(req.body.filter, req.body.update);

    logger("debug", "Multiple documents updated successfully", { count: result.modifiedCount, collection: model.modelName });

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
async function deleteById(req, res, next, model) {
  try {
    const { id } = req.params;

    logger("info", "Deleting document by ID", { id, collection: model.modelName });

    const document = await model.deleteOneById(id);

    logger("debug", "Document deleted successfully", { id, collection: model.modelName });

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /{model}/many - Delete many documents by filter
 */
async function deleteMany(req, res, next, model) {
  try {
    // Check if filter exists
    if (!req?.body?.filter) {
      throw new ValidationError(ERROR_MESSAGES.FILTER_REQUIRED);
    }

    // Security check to prevent deleting all data
    const filter = req.body.filter;

    // Check if filter is empty object {} which would match all documents
    if (Object.keys(filter).length === 0) {
      throw new ValidationError(ERROR_MESSAGES.EMPTY_FILTER_NOT_ALLOWED);
    }

    logger("info", "Deleting multiple documents by filter", { filter, collection: model.modelName });

    const result = await model.deleteManyByFilter(filter);

    logger("debug", "Multiple documents deleted successfully", { count: result.deletedCount, collection: model.modelName });

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
};
