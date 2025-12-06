/**
 * Global Signup Handlers
 * Multi-country, multi-currency, multi-language signup flow
 */

import { GlobalService } from "./services/global-service.js";
import { I18n } from "./utils/i18n.js";


class GlobalSignupHandler {
  constructor(telegram, userService, otp) {
    this.telegram = telegram;
    this.userService = userService;
    this.otp = otp;
  }

  /**
   * Step 1: Ask for country
   */
  async askCountry(chatId) {
    const text = `🌍 <b>Welcome to BETRIX</b>\n\n` +
      `Where are you joining from?\n\n` +
      `This helps us show the right currency and payment methods.`;

    const kb = GlobalService.buildCountryKeyboard();
    await this.telegram.sendMessage(chatId, text, { reply_markup: kb });
  }

  /**
   * Step 2: Country selected, ask language
   */
  async askLanguage(chatId, userId, countryCode) {
    const country = GlobalService.getCountry(countryCode);
    if (!country) {
      await this.telegram.sendMessage(chatId, "❌ Invalid country. Try again.");
      return this.askCountry(chatId, userId);
    }

    await this.userService.saveUser(userId, { country: countryCode });

    const text = `${country.flag} <b>${country.name}</b>\n\n` +
      `Choose your language:`;

    const kb = GlobalService.buildLanguageKeyboard(countryCode);
    await this.telegram.sendMessage(chatId, text, { reply_markup: kb });
  }

  /**
   * Step 3: Language selected, ask for plan
   */
  async askPlan(chatId, userId, language) {
    const user = await this.userService.getUser(userId);
    await this.userService.saveUser(userId, { language });

    const country = GlobalService.getCountry(user.country);
    const pricing = {
      member: GlobalService.getLocalPricing("member", user.country),
      vvip_day: GlobalService.getLocalPricing("vvip_day", user.country),
      vvip_week: GlobalService.getLocalPricing("vvip_week", user.country),
      vvip_month: GlobalService.getLocalPricing("vvip_month", user.country),
    };

    const text = `💎 <b>Choose Your Plan — ${country.name}</b>\n\n` +
      `🎁 <b>Free</b>\n` +
      `├─ Live matches\n` +
      `├─ Basic odds\n` +
      `└─ AI analysis\n\n` +
      `👤 <b>Member (One-time)</b>\n` +
      `├─ All Free features\n` +
      `├─ Alerts & stats\n` +
      `└─ ${pricing.member.displayText}\n\n` +
      `💎 <b>VVIP (Subscription)</b>\n` +
      `├─ Professional analysis\n` +
      `├─ Betting coach\n` +
      `├─ Daily: ${pricing.vvip_day.displayText}\n` +
      `├─ Weekly: ${pricing.vvip_week.displayText}\n` +
      `└─ Monthly: ${pricing.vvip_month.displayText}`;

    const kb = {
      inline_keyboard: [
        [{ text: "🎁 Free", callback_data: "plan:free" }],
        [{ text: `👤 Member - ${pricing.member.currency} ${pricing.member.amount}`, callback_data: "plan:member" }],
        [
          { text: `💎 Day - ${pricing.vvip_day.currency} ${pricing.vvip_day.amount}`, callback_data: "plan:vvip_day" },
        ],
        [
          { text: `💎 Week - ${pricing.vvip_week.currency} ${pricing.vvip_week.amount}`, callback_data: "plan:vvip_week" },
        ],
        [
          { text: `💎 Month - ${pricing.vvip_month.currency} ${pricing.vvip_month.amount}`, callback_data: "plan:vvip_month" },
        ],
      ],
    };

    await this.telegram.sendMessage(chatId, text, { reply_markup: kb });
  }

  /**
   * Step 4: Plan selected, ask for payment method
   */
  async askPaymentMethod(chatId, userId, plan) {
    const user = await this.userService.getUser(userId);
    await this.userService.saveUser(userId, { selectedPlan: plan });

    if (plan === "free") {
      return this.completeSignup(chatId, userId, "free", null);
    }

    const text = `💳 <b>How do you want to pay?</b>\n\n` +
      `Available for ${GlobalService.getCountry(user.country).name}:`;

    const kb = GlobalService.buildPaymentKeyboard(user.country);
    await this.telegram.sendMessage(chatId, text, { reply_markup: kb });
  }

  /**
   * Step 5: Payment method selected, ask for phone
   */
  async askPhone(chatId, userId, paymentMethod) {
    await this.userService.saveUser(userId, { paymentMethod });

    const text = `📱 <b>Verify Your Phone</b>\n\n` +
      `Enter your phone number (with country code or local format):`;

    await this.telegram.sendMessage(chatId, text);
    // State for next message will be handled in main worker
  }

  /**
   * Step 6: Phone provided, send OTP
   */
  async sendOTP(chatId, userId, phone) {
    const user = await this.userService.getUser(userId);

    // Validate & format phone
    const isValid = GlobalService.validatePhone(phone, user.country);
    if (!isValid) {
      await this.telegram.sendMessage(chatId, `❌ Invalid phone format for ${GlobalService.getCountry(user.country).name}`);
      return this.askPhone(chatId, userId, user.paymentMethod);
    }

    const formatted = GlobalService.formatPhone(phone, user.country);
    const result = await this.otp.sendOTP(userId, formatted);

    if (!result.success) {
      await this.telegram.sendMessage(chatId, `❌ Failed to send OTP: ${result.error}`);
      return this.askPhone(chatId, userId, user.paymentMethod);
    }

    await this.telegram.sendMessage(chatId,
      `✅ OTP sent to ${formatted}\n\n` +
      `Enter the 6-digit code:`,
    );
    await this.userService.saveUser(userId, { phone: formatted });
  }

  /**
   * Step 7: OTP verified, show payment processing
   */
  async completeSignup(chatId, userId, plan, paymentMethod) {
    const user = await this.userService.getUser(userId);
    const country = GlobalService.getCountry(user.country);

    if (plan === "free") {
      await this.userService.saveUser(userId, { tier: "free", signupComplete: true });
      await this.telegram.sendMessage(chatId,
        `✅ <b>Welcome to BETRIX!</b>\n\n` +
        `🎁 Free tier activated\n` +
        `📍 ${country.flag} ${country.name}\n` +
        `🌐 Language: ${I18n.supportedLanguages().includes(user.language) ? user.language : 'English'}\n\n` +
        `Get started:\n` +
        `/menu - Main menu\n` +
        `/live - Live matches\n` +
        `/pricing - Upgrade to Member/VVIP`,
      );
    } else {
      const pricing = GlobalService.getLocalPricing(plan, user.country);
      await this.telegram.sendMessage(chatId,
        `⏳ <b>Processing Payment</b>\n\n` +
        `Amount: ${pricing.displayText}\n` +
        `Method: ${paymentMethod}\n` +
        `Status: Awaiting confirmation...\n\n` +
        `This usually takes less than 1 minute.`,
      );

      // In production, integrate actual payment processing here
      await this.userService.saveUser(userId, {
        tier: plan.startsWith("vvip") ? "vvip" : "member",
        signupComplete: true,
        selectedPlan: plan,
        paymentMethod,
      });

      await this.telegram.sendMessage(chatId,
        `✅ <b>Success!</b>\n\n` +
        `💎 ${plan === "member" ? "Member" : "VVIP"} tier activated\n` +
        `📍 ${country.flag} ${country.name}\n` +
        `💰 Amount: ${pricing.displayText}\n` +
        `🌐 Language: ${user.language.toUpperCase()}\n\n` +
        `Now you have access to all premium features!\n\n` +
        `/menu - Start exploring`,
      );
    }
  }
}

export { GlobalSignupHandler };
