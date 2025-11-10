/**
 * Assert helper function
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message if condition is false
 * @throws {TypeError} If condition is false
 */
export function assert (condition, message) {
  if (!condition) throw new TypeError(message)
}
