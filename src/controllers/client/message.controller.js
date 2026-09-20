const MessageService = require('../../services/client/message.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.envoyer = asyncHandler(async (req, res) => {
  const result = await MessageService.envoyerMessage(req.user.id, req.body);
  return created(res, { message: result.message }, 'Message envoyé');
});

exports.conversations = asyncHandler(async (req, res) => {
  const result = await MessageService.conversations(req.user.id);
  return ok(res, { conversations: result.conversations }, 'Conversations');
});

exports.historique = asyncHandler(async (req, res) => {
  const result = await MessageService.historique(req.user.id, req.params.userId);
  return ok(res, { messages: result.messages }, 'Historique');
});

exports.marquerLu = asyncHandler(async (req, res) => {
  await MessageService.marquerLu(req.params.messageId, req.user.id);
  return ok(res, {}, 'Message marqué comme lu');
});

exports.nombreNonLus = asyncHandler(async (req, res) => {
  const result = await MessageService.nombreNonLus(req.user.id);
  return ok(res, { nombre: result.nombre }, 'Nombre de messages non lus');
});
