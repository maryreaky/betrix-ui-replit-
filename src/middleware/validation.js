/**
 * Input Validation Middleware
 */

import Joi from "joi";

class ValidationMiddleware {
  /**
   * Validate phone number
   */
  static validatePhone(phone, country = "KE") {
    void country;
    const schema = Joi.string()
      .pattern(/[\d\s\-+]+$/)
      .min(10)
      .max(15)
      .required();

    const { error, value } = schema.validate(phone);
    return { valid: !error, value, error: error?.message };
  }

  /**
   * Validate email
   */
  static validateEmail(email) {
    const schema = Joi.string().email().required();
    const { error, value } = schema.validate(email);
    return { valid: !error, value, error: error?.message };
  }

  /**
   * Validate command input
   */
  static validateCommandInput(input) {
    // Prevent common injection patterns
    const blockedPatterns = [
      /DROP|DELETE|INSERT|UPDATE|EXEC/i,
      /<script|javascript:/i,
      /union.*select/i,
      /1=1/i,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(input)) {
        return { valid: false, error: "Invalid input detected" };
      }
    }

    return { valid: true, value: input };
  }

  /**
   * Sanitize user input
   */
  static sanitize(input) {
    return String(input)
      .trim()
      .replace(/[<>"']/g, "")
      .slice(0, 500); // Max 500 chars
  }

  /**
   * Validate user data
   */
  static validateUserData(data) {
    const schema = Joi.object({
      name: Joi.string().max(100),
      phone: Joi.string().pattern(/[\d\s\-+]+$/),
      country: Joi.string().length(2),
      email: Joi.string().email(),
    });

    return schema.validate(data, { abortEarly: false });
  }

  /**
   * Validate payment data
   */
  static validatePaymentData(data) {
    const schema = Joi.object({
      amount: Joi.number().positive().required(),
      method: Joi.string()
        .valid("till", "paypal", "binance", "bank", "stk")
        .required(),
      tier: Joi.string().valid("member", "vvip_day", "vvip_week", "vvip_month"),
      reference: Joi.string().max(100),
    });

    return schema.validate(data);
  }
}

export { ValidationMiddleware };
