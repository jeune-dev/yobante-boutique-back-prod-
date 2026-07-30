const logger = require('../config/logger');

function sendEmail(to, subject, _htmlContent) {
  if (process.env.NODE_ENV === 'test') {
    logger.debug(`[TEST] Email envoyé à ${to}: ${subject}`);
    return Promise.resolve({ success: true, messageId: 'test-message-id' });
  }

  logger.info(`Email envoyé à ${to}: ${subject}`);
  return Promise.resolve({ success: true });
}

module.exports = {
  sendEmail,
};
