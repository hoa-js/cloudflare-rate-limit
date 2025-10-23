/**
 * Assert helper function
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message if condition is false
 * @throws {TypeError} If condition is false
 */
export function assert (condition, message) {
  if (!condition) throw new TypeError(message)
}

/**
 * Get binding from context
 * @param {any} ctx - Hoa context
 * @param {any} binding - Binding name (string) or factory function
 * @returns {any} The resolved binding
 */
export function getBinding (ctx, binding) {
  return typeof binding === 'string' ? ctx.env[binding] : binding(ctx)
}
