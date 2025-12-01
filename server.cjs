const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
app.use(bodyParser.json());

// DB connection
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Verify Lipana signature
function verifySignature(req) {
  const signature = req.headers["x-lipana-signature"];
  const payload = JSON.stringify(req.body);
  const expected = crypto
    .createHmac("sha256", process.env.LIPANA_SECRET)
    .update(payload)
    .digest("hex");
  return signature === expected;
}

app.post("/webhook/mpesa", async (req, res) => {
  if (!verifySignature(req)) {
    console.log("Invalid signature");
    return res.status(401).send("Unauthorized");
  }

  console.log("Webhook received:", req.body);

  try {
    await pool.query(
      "INSERT INTO webhooks(event, transaction_id, amount, phone, reference, message, timestamp, raw_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        req.body.event,
        req.body.transaction_id,
        req.body.amount,
        req.body.phone,
        req.body.reference,
        req.body.message,
        req.body.timestamp,
        req.body, // full JSON payload
      ]
    );
    res.status(200).send("OK");
  } catch (err) {
    console.error("DB insert error:", err);
    res.status(500).send("DB Error");
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
