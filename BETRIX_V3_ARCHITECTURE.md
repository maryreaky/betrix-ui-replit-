# BETRIX Bot v3 - Complete Architecture & Implementation

**Date:** November 26, 2025  
**Status:** v3 Release - Complete redesign with command hierarchy, natural language routing, and supreme UX  
**Target Platforms:** Telegram, Kenya & East Africa

---

## 📋 Executive Summary

BETRIX is now a **supreme sports betting assistant** with:
- ✅ **9 core commands** (plus natural language intent routing)
- ✅ **Guided signup flow** with profile collection (name → country → age)
- ✅ **Unified payment hub** (M-Pesa, PayPal, Binance, Card)
- ✅ **VVIP tier system** (Daily, Weekly, Monthly subscriptions)
- ✅ **Live odds aggregation** with fixture IDs and quick-bet buttons
- ✅ **AI-powered match analysis** with confidence scores and narrative explanations
- ✅ **Betting sites directory** (6 Kenya bookmakers with bonus info)
- ✅ **Curated news feed** (injuries, lineups, transfers, form trends)
- ✅ **Comprehensive help system** with FAQs
- ✅ **State machine** for multi-step workflows
- ✅ **Redis-backed data models** for user profiles, payments, AI cache, and odds

---

## 🚀 Core Commands (9)

### `/start` - Welcome & onboarding
- **Response:** Welcome greeting + feature highlights + signup prompt
- **Buttons:** [Sign up] [Learn more] [Help]
- **Purpose:** Entry point; introduces BETRIX value

### `/signup` - Guided profile collection → signup fee payment
- **Flow:**
  1. Collect name (with validation)
  2. Collect country (KE/UG/TZ)
  3. Collect age (18-120)
  4. Show signup fee prompt (150 KES / $1)
  5. Route to payment methods
- **State:** Uses state machine to handle multi-turn conversation
- **Purpose:** Onboard new users with structured inputs

### `/pay` - Unified payment hub
- **Shows:**
  - ✅ Payment status (signup paid: yes/no, VVIP: active/inactive)
  - 💳 Available actions: pay signup, subscribe VVIP, manage subscription, receipts
- **Methods:** M-Pesa STK, PayPal, Binance USDT/BTC, Card
- **Purpose:** Central payment management + history tracking

### `/menu` - Main dashboard
- **Layout (4×2 grid):**
  - 🎯 Odds | 🧠 Analyze
  - 🗞️ News | 🔗 Betting Sites
  - 👑 VVIP | 💳 Pay
  - ❓ Help | 👤 Profile
- **Personalized:** Shows user greeting + VVIP status if active
- **Purpose:** Central hub for all features

### `/odds` - Today's fixtures + live odds
- **Output:**
  - Fixtures card: Team A vs Team B | Kickoff time | Odds (H/D/A)
  - Up to 8 matches shown with aggregated odds
  - Refresh indicator
- **Filters:** [By League] [By Time] [Live Now] [Top Picks] [Refresh]
- **Quick actions:** [Analyze] [Add to slip] per fixture
- **Purpose:** Fast access to betting opportunities

### `/analyze` - AI match predictions
- **Per-match output:**
  - 🎯 Pick (e.g., "Arsenal Win")
  - 📊 Confidence % (0-100, calibrated over 400+ predictions)
  - 📋 Narrative (key stats, trends, injuries, tactical notes)
  - ⚠️ Risk flags (suspensions, travel, underdog variance)
  - 💡 Calibration note
- **Actions:** [Place bet] [Show odds] [Why this pick?] [Compare picks]
- **Purpose:** Explainable, confident predictions with narrative

### `/news` - Curated sports news & updates
- **Categories:** [Breaking] [Injuries] [Lineups] [Transfers] [Form trends]
- **Per-item:** Headline + 1-2 sentence summary + source tag
- **Purpose:** Context that affects odds and decision-making

### `/vvip` - Premium tier system & benefits
- **Benefits shown:**
  - ✓ Priority picks (higher signal)
  - ✓ Early access (30 min before kickoff)
  - ✓ Private feeds & exclusive match threads
  - ✓ Concierge support (faster responses)
  - ✓ Deep dives & post-match analysis
- **Pricing:**
  - Daily: 200 KES / $2
  - Weekly: 1,000 KES / $8
  - Monthly: 3,000 KES / $20
- **Actions:** [Subscribe daily/weekly/monthly] [Manage] [Cancel]
- **Purpose:** Revenue stream + premium user retention

### `/help` - FAQs & support
- **Topics:** Signup, Payment, Accuracy, VVIP, Refunds, Contact
- **Actions:** [Email Support] [Privacy Policy] [Back]
- **Purpose:** Self-serve help + support escalation

---

## 🧠 Natural Language Intent Routing

In addition to explicit commands, the bot **classifies user messages by intent**:

| User Says | Intent | Routes To |
|-----------|--------|-----------|
| "I want to join" | signup | /signup |
| "Show odds" / "Today's matches" | odds | /odds |
| "Analyze Arsenal vs Chelsea" | analyze | /analyze |
| "What's new?" / "News" | news | /news |
| "Help" / "FAQ" | help | /help |
| "Pay" / "Subscribe" / "VVIP" | payment | /pay or /vvip |
| "Betting sites" / "Where to bet?" | sites | Betting sites menu |
| "Main menu" / "Home" | menu | /menu |

### Implementation
- **File:** `src/handlers/message-handler-v3.js`
- **Function:** `classifyIntent()` uses regex patterns
- **Fallback:** Shows help if intent unknown

---

## 📊 Data Models & Storage

### User Profile (Redis: `user:{userId}`)
```
name: string
country: string (KE, UG, TZ)
age: number
phone: string (for M-Pesa)
signup_paid: boolean
vvip_tier: string (inactive, daily, weekly, monthly)
vvip_expiry: timestamp
preferred_site: string (betika, sportpesa, etc)
favorite_leagues: array
referral_code: string
total_bets_placed: number
win_rate: number (%)
total_won: number (KES)
```

### Payment Ledger (Redis: `payment:{paymentId}` + `order:{orderId}`)
```
payment_id: string (UUID)
order_id: string (ORD{timestamp})
user_id: string
amount: number
currency: string (KES, USD)
method: string (mpesa, paypal, binance, card)
purpose: string (signup_fee, vvip_*)
status: string (pending, confirmed, failed)
created_at: timestamp
confirmed_at: timestamp
webhook_received: boolean
webhook_verified: boolean
```

### AI Output Cache (Redis: `ai_output:{queryId}`)
```
query_id: string
user_id: string
query: string
fixture_id: string
prediction: string
confidence: number (0-100)
narrative: string
risk_flags: array
provider: string (azure_openai, gemini)
model_used: string
timestamp: timestamp
accuracy_verified: boolean
was_correct: boolean (post-match)
```

### Odds Cache (Redis: `odds:{fixtureId}`)
```
fixture_id: string
home_team: string
away_team: string
kickoff: timestamp
league: string
odds_home: number
odds_draw: number
odds_away: number
source: string (aggregated, betika, sportpesa)
updated_at: timestamp
expires_at: timestamp (1-hour TTL)
```

### State Machine (Redis: `user:{userId}:state`)
- `idle` - User not in any flow
- `signup_name` - Awaiting name input
- `signup_country` - Awaiting country input
- `signup_age` - Awaiting age input
- `payment_pending` - Waiting for payment confirmation
- `betting_slip_active` - User has an active bet slip
- `analyzing` - AI is processing a request
- `browsing_odds` - User viewing odds with filters

**State data stored in:** `user:{userId}:state_data` (JSON hash)

---

## 🎨 Inline Keyboard Layouts

### Main Menu (4 rows × 2 cols)
```
[🎯 Odds] [🧠 Analyze]
[🗞️ News] [🔗 Betting Sites]
[👑 VVIP] [💳 Pay]
[❓ Help] [👤 Profile]
```

### Odds Submenu (vertical)
```
[🏆 By League]
[⏰ By Time]
[🔥 Live Now]
[⭐ Top Picks]
[🔄 Refresh]
[⬅️ Back]
```

### Payment Methods (vertical)
```
[📱 M-Pesa STK Push]
[🔵 PayPal]
[🟡 Binance USDT]
[💳 Card]
[⬅️ Back]
```

### VVIP Tiers (inactive state)
```
[📅 Daily (200 KES)]
[📆 Weekly (1,000 KES)]
[📅 Monthly (3,000 KES)]
[⬅️ Back]
```

---

## 🌍 Betting Sites Directory

**Kenya sites** (with bonuses):
1. 🎲 **Betika** - 10,000 KES welcome bonus
2. ⚽ **SportPesa** - 15,000 KES welcome offer
3. 🏆 **Odibets** - 100% match on first deposit
4. 🎯 **Betway Kenya** - 5,000 KES first bet credit
5. 🌟 **1xBet** - 100% bonus up to 50,000 KES
6. 💰 **Betkwatro** - Loyalty rewards program

**Features:**
- Direct links to each site
- Bonus/offer information
- 4.3–4.7 star ratings
- "Set preferred site" → stored in user profile
- "Compare odds" → routes to premium feature (VVIP+)

---

## 💰 Payment Integration

### Signup Fee
- **Amount:** 150 KES or $1 USD (one-time)
- **Methods:** M-Pesa, PayPal, Binance, Card
- **Confirmation:** Webhook verification + status update to Redis
- **Next step:** Auto-welcome + quick tour

### VVIP Subscription
- **Daily:** 200 KES / $2
- **Weekly:** 1,000 KES / $8
- **Monthly:** 3,000 KES / $20
- **Auto-renew:** Optional (default off)
- **Cancellation:** Anytime; refund logic TBD (non-refundable baseline)

### Payment Flow
1. User selects tier/method
2. Bot creates order in Redis + payment ledger
3. Payment gateway (PayPal SDK, M-Pesa API) initiated
4. User sees checkout URL or STK prompt
5. Webhook confirms payment
6. Bot updates Redis: status = "confirmed"
7. If signup: activate profile, unlock features
8. If VVIP: set tier + expiry, show success

---

## 📁 File Structure & Handlers

```
src/handlers/
├── commands-v3.js           # Main 9 commands + CLI routing
├── message-handler-v3.js    # Intent classification + signup state machine
├── callbacks-v3.js          # Unified callback router (menu, pay, vvip, etc)
├── betting-sites.js         # Kenya bookmaker directory + callbacks
├── data-models.js           # Redis schemas + CRUD helpers
├── payment-router.js        # PayPal SDK + payment method selection
├── telegram-handler-v2.js   # Telegram webhook input dispatcher
└── menu-system.js           # Formatters (odds, news, standings, profile)
```

### Import Flow
```
Webhook (telegram-handler-v2.js)
  ↓
  ├─ Message → message-handler-v3.js (intent routing + state handling)
  │   ↓
  │   └─ handleMessage() → classifyIntent() → intent handler → command
  │
  └─ Callback → callbacks-v3.js (unified router)
      ↓
      ├─ menu_* → handleMenuCallback()
      ├─ pay_* → payment-router.js
      ├─ vvip_* → handleVVIPCallback()
      ├─ sites_* → betting-sites.js
      ├─ help_* → handleHelpCallback()
      ├─ odds_* → handleOddsCallback()
      ├─ analyze_* → handleAnalyzeCallback()
      ├─ news_* → handleNewsCallback()
      ├─ bet_* → handleBettingCallback()
      └─ signup_* → handleSignupCallback()
```

---

## 🔄 Typical User Journey (First Day)

### Step 1: /start
- **Bot:** "Welcome to BETRIX — your AI-powered sports-tech assistant. Sign up to begin."
- **Buttons:** [Sign up] [Learn more] [Help]

### Step 2: User taps "Sign up" → /signup
- **Bot:** "What's your full name?"
- **User:** "John Doe"

### Step 3: State = signup_name → Input handling
- **Bot:** "Nice to meet you, John! Which country are you in?"
- **User:** "Kenya"

### Step 4: State = signup_country → Input handling
- **Bot:** "Got it, KE! How old are you?"
- **User:** "28"

### Step 5: State = signup_age → Profile created
- **Bot:** "Profile complete! John, pay a one-time signup fee of 150 KES to unlock all features."
- **Buttons:** [Pay now] [Later]

### Step 6: User taps "Pay now" → /pay
- **Bot:** "Choose payment method:"
- **Buttons:** [M-Pesa STK] [PayPal] [Binance] [Card]

### Step 7: User selects M-Pesa → Payment initiated
- **Bot:** "STK prompt sent to your phone. Complete payment."
- **Payment ledger created:** order_id = ORD1732619940, status = pending

### Step 8: Webhook confirms payment
- **Bot:** "🎉 Payment confirmed, John! Welcome to BETRIX!"
- **Auto-actions:** Activate profile, unlock features, show quick tour

### Step 9: Quick tour
- **Bot:** "You're in! Here's what you can do:"
- **Buttons:** [Get odds 🎯] [Analyze 🧠] [News 🗞️] [Betting sites 🔗] [VVIP 👑] [Main menu 🏠]

### Step 10: User taps "Get odds"
- **Bot:** Shows today's fixtures with odds, filters, and quick-bet buttons
- **Example fixture card:**
  ```
  1. Arsenal vs Chelsea
  ⏰ 19:30
  Odds: 1.85 | 3.40 | 4.10
  ```

### Step 11: User taps "Analyze" on a fixture
- **Bot:** AI prediction with confidence, narrative, risk flags
- **Buttons:** [Place bet] [Show odds] [Why?] [Back]

### Step 12: User explores VVIP
- **Bot:** Shows benefits + pricing
- **Buttons:** [Daily] [Weekly] [Monthly] [Back]

---

## 🛠️ Tech Stack

- **Runtime:** Node.js (ES modules)
- **State Store:** Redis (ioredis)
- **APIs:**
  - OpenLigaDB (fixtures, standings)
  - API-Football (live data, odds)
  - RSS aggregator (news feeds)
  - Azure OpenAI (AI analysis)
  - PayPal Checkout SDK (payments)
  - M-Pesa API (stk_push)
  - Telegram Bot API (webhooks)
- **Deployment:** Render (web + worker on Procfile)

---

## 🚢 Deployment Checklist

- [ ] Environment variables set (TELEGRAM_TOKEN, REDIS_URL, PAYPAL_*, API keys)
- [ ] Worker process running (src/worker-final.js)
- [ ] Webhook URL configured + HTTPS
- [ ] Payment webhooks mapped (PayPal, M-Pesa)
- [ ] Redis connection tested
- [ ] Health checks (`/health`, `/ready`)
- [ ] Logs configured (structured + timestamps)
- [ ] Rate limiting enabled
- [ ] Error handlers active

---

## 📈 Success Metrics

- **Signups:** Track /start → /signup → payment completion
- **Engagement:** Active /menu taps, /odds views, /analyze requests
- **VVIP conversion:** Free users → paid tiers
- **Payment success rate:** Target 95%+
- **Prediction accuracy:** Calibrate confidence post-match
- **Support tickets:** Monitor via email or callback

---

## 🔮 Future Enhancements

1. **Live telegram odds:** Real-time odds updates pushed to user chats
2. **Betslip persistence:** Save partially-filled slips; resume later
3. **Multi-match analysis:** Batch analyze 10+ fixtures at once
4. **Leaderboards:** Monthly ranking of top predictors
5. **Social:** Share picks, follow other analysts
6. **Custom alerts:** "Notify me if odds drop below X"
7. **Deep API integrations:** Direct-to-bookmaker bet placement (if TOS allows)
8. **Mobile app:** Native iOS/Android alongside Telegram bot
9. **Analytics dashboard:** User analytics + personal stats
10. **Telegram mini-app:** In-app betslip + live odds (if Telegram launches)

---

**Built with ❤️ for East African bettors.**  
**Telegram:** @betrix_bot  
**Email:** support@betrix.app  
**Privacy:** See `/help` → Privacy Policy
