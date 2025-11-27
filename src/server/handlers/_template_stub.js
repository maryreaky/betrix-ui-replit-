const { sendText } = require("../utils/send");
exports.handle = async (chatId) => {
  await sendText(chatId, "BETRIX: placeholder handler — full logic coming soon.");
};
