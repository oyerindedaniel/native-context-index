'use strict';

/**
 * @type {Set<number>}
 */
const statusCodeCacheableByDefault = new Set([200, 404]);

module.exports = { statusCodeCacheableByDefault };
