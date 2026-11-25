'use strict';

function validate(schemas = {}) {
  return (req, res, next) => {
    const errors = [];
    req.validated = {};

    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) {
        continue;
      }

      const result = schema.safeParse(req[part]);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({
            location: part,
            field: issue.path.join('.') || part,
            message: issue.message,
          });
        }
      } else {
        req[part] = result.data;
        req.validated[part] = result.data;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        message: 'Input tidak valid',
        errors,
      });
    }

    return next();
  };
}

module.exports = validate;

