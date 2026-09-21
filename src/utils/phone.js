const { isValidPhoneNumber, parsePhoneNumberFromString } = require('libphonenumber-js');

/**
 * Valide et normalise un numéro de téléphone.
 * @param {string} phone - Numéro de téléphone (ex: '771234567')
 * @param {string} countryCode - Code pays ISO (ex: 'SN', 'FR')
 * @returns {object} { isValid: boolean, phoneNumber: string|null }
 */
const validateAndFormatPhone = (phone, countryCode) => {
  if (!phone || !countryCode) return { isValid: false, phoneNumber: null };
  
  const phoneNumber = parsePhoneNumberFromString(phone, countryCode);
  if (phoneNumber && phoneNumber.isValid()) {
    return { 
      isValid: true, 
      phoneNumber: phoneNumber.format('E.164') // Normalisation E.164
    };
  }
  return { isValid: false, phoneNumber: null };
};

module.exports = { validateAndFormatPhone };
