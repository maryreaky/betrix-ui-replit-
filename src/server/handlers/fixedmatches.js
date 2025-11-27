const { sendText } = require("../utils/send");
exports.handle = async (chatId) => {
  await sendText(chatId, "BETRIX: /fixedmatches is active. Full logic coming soon.");
};
