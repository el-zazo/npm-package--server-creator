/**
 * Utility functions for password hashing and verification
 */
const { compare, hash } = require("bcrypt");
const { AUTH, ERROR_MESSAGES } = require("./constants");

/**
 * Hash a password if hashing is enabled
 * @param {String} password - Plain text password
 * @param {Boolean} useHash - Whether to hash the password (default: true)
 * @param {Number} saltRounds - Number of salt rounds for bcrypt (default: 10)
 * @returns {Promise<String>} - Hashed or plain password depending on useHash
 */
const hashPassword = async (password, useHash = true, saltRounds = AUTH.DEFAULT_SALT_ROUNDS) => {
  if (!password) {
    throw new Error(ERROR_MESSAGES.PASSWORD_REQUIRED);
  }

  // If hashing is disabled, return the plain password
  if (!useHash) {
    return password;
  }

  // Otherwise hash the password
  return await hash(password, saltRounds);
};

/**
 * Verify a password against a hash or plain text
 * @param {String} password - Plain text password to verify
 * @param {String} storedPassword - Stored password (hashed or plain) to compare against
 * @param {Boolean} useHash - Whether the stored password is hashed (default: true)
 * @returns {Promise<Boolean>} - True if password matches, false otherwise
 */
const verifyPassword = async (password, storedPassword, useHash = true) => {
  if (!password || !storedPassword) {
    return false;
  }

  // If hashing is disabled, use timing-safe comparison to prevent timing attacks.
  // We hash both values with SHA-256 first so that the buffers are always the
  // same length — this eliminates the length-leak that a simple
  // `if (a.length !== b.length) return false` would introduce before
  // calling timingSafeEqual.
  if (!useHash) {
    const crypto = require("crypto");
    const hashA = crypto.createHash("sha256").update(password).digest();
    const hashB = crypto.createHash("sha256").update(storedPassword).digest();
    return crypto.timingSafeEqual(hashA, hashB);
  }

  // Otherwise use bcrypt compare
  return await compare(password, storedPassword);
};

module.exports = {
  hashPassword,
  verifyPassword,
};
