/**
 * Sets the length of a string by adding a specified character at a specified position
 *
 * @param {string|number} text - The text to modify
 * @param {Object} options - Configuration options
 * @param {string} [options.caracter="0"] - The character to add
 * @param {number} [options.length=2] - The target length
 * @param {string} [options.position="start"] - The position to add characters ("start" or "end")
 * @returns {string} The modified string with the specified length
 */
const setLenByCaracter = (text, options = {}) => {
  try {
    const { caracter = "0", length = 2, position = "start" } = options;
    const normalizedPosition = position.toLowerCase();
    const textString = String(text);
    const diffLen = length - textString.length;

    if (diffLen <= 0) {
      return textString;
    }

    switch (normalizedPosition) {
      case "start":
        return `${caracter.repeat(diffLen)}${textString}`;
      case "end":
        return `${textString}${caracter.repeat(diffLen)}`;
      default:
        return textString;
    }
  } catch (error) {
    console.error(`Error in setLenByCaracter: ${error.message}`);
    return String(text);
  }
};

/**
 * Adds leading zeros to a number to achieve a specified length
 *
 * @param {number} num - The number to pad with zeros
 * @param {number} len - The target length
 * @returns {string} The number padded with leading zeros
 */
const setLenByZero = (num = 1, len = 2) => {
  return setLenByCaracter(num, { length: len });
};

/**
 * Adds trailing spaces to a string to achieve a specified length
 *
 * @param {string} text - The text to pad with spaces
 * @param {number} len - The target length
 * @returns {string} The text padded with trailing spaces
 */
const setLenBySpace = (text = "", len = 20) => {
  return setLenByCaracter(text, { caracter: " ", length: len, position: "end" });
};

/**
 * Converts seconds to a human-readable duration string
 *
 * @param {number} seconds - The number of seconds to convert
 * @returns {string} A formatted duration string (e.g. "15 minutes", "1 hour")
 */
const secondsToDuration = (seconds) => {
  try {
    if (isNaN(seconds)) {
      throw new Error(`Input '${seconds}' is not a valid number`);
    }

    const totalSeconds = Math.ceil(Number(seconds));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (h > 0) return `${h} hour${h > 1 ? "s" : ""}`;
    if (m > 0) return `${m} minute${m > 1 ? "s" : ""}`;
    return `${s} second${s > 1 ? "s" : ""}`;
  } catch (error) {
    console.error(`Error in secondsToDuration: ${error.message}`);
    return String(seconds);
  }
};

module.exports = { secondsToDuration, setLenBySpace, setLenByZero, setLenByCaracter };
