/**
 * M-Pesa Callback Handler
 * Handles payment verification from Safaricom
 */

import { Logger } from "../utils/logger.js";
import { db } from "../database/db.js";
import { payments, users } from "../database/schema.js";
import { eq } from "drizzle-orm";

const logger = new Logger("MpesaCallback");

class MpesaCallbackHandler {
  constructor(telegram) {
    this.telegram = telegram;
  }

  /**
   * Handle payment notification from M-Pesa
   */
  async handleCallback(req, res) {
    try {
      const { Body } = req.body;
      const stkCallback = Body.stkCallback;

      if (stkCallback.ResultCode !== 0) {
        logger.warn("STK payment failed", stkCallback.ResultDesc);
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Received" });
      }

      const callbackData = stkCallback.CallbackMetadata.Item;
      const amount = this.extractValue(callbackData, 1);
      const code = this.extractValue(callbackData, 2);
      const phone = this.extractValue(callbackData, 4);
      void phone;

      // Find payment by reference code
      const payment = await db.query.payments.findFirst({
        where: eq(payments.reference, code),
      });

      if (!payment) {
        logger.warn(`Payment not found for code: ${code}`);
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Received" });
      }

      // Verify amount
      if (Number(payment.amount) !== Number(amount)) {
        logger.error(`Amount mismatch: ${payment.amount} vs ${amount}`);
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Received" });
      }

      // Update payment to confirmed
      await db
        .update(payments)
        .set({ status: "confirmed", transactionId: code, verifiedAt: new Date() })
        .where(eq(payments.id, payment.id));

      // Update user tier
      const user = await db.query.users.findFirst({
        where: eq(users.id, payment.userId),
      });

      if (user) {
        const tierUpdateData = {};

        if (payment.tier === "member") {
          tierUpdateData.tier = "member";
        } else if (payment.tier?.startsWith("vvip")) {
          tierUpdateData.tier = "vvip";

          // Calculate expiry
          const now = new Date();
          if (payment.tier === "vvip_day") {
            tierUpdateData.vvipExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          } else if (payment.tier === "vvip_week") {
            tierUpdateData.vvipExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          } else if (payment.tier === "vvip_month") {
            tierUpdateData.vvipExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          }
        }

        await db.update(users).set(tierUpdateData).where(eq(users.id, user.id));

        // Send confirmation to user
        const tierName =
          payment.tier === "member" ? "Member" : "VVIP";
        await this.telegram?.sendMessage(
          user.chatId,
          `✅ Payment confirmed!\n💎 ${tierName} tier activated\n\nYou now have access to premium features!`
        );

        logger.info(`Payment verified: user ${user.id} - ${payment.tier}`);
      }

      return res.status(200).json({ ResultCode: 0, ResultDesc: "Received" });
    } catch (err) {
      logger.error("Callback processing failed", err);
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Received" });
    }
  }

  /**
   * Extract value from M-Pesa callback metadata
   */
  extractValue(items, itemIndex) {
    const item = items.find((i) => i.Name.includes(itemIndex));
    return item?.Value || null;
  }
}

export { MpesaCallbackHandler };
