import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import SibApiV3Sdk from "sib-api-v3-sdk";

dotenv.config();

const app = express();

// =====================
// CORS Configuration
// =====================
const allowedOrigins = [
  "http://localhost:5173",       // local dev
  "https://www.ujananaujuzi.org", // production
   "https://ujana-na-ujuzi.vercel.app"  // Vercel preview
];

app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (like curl/postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified origin.`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));

app.use(express.json());

const PORT = process.env.PORT || 5000;

// =====================
// OAuth Token Function (Mpesa)
// =====================
async function getAccessToken() {
  try {
    const auth = "Basic " + Buffer.from(
      `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString("base64");

    const url = process.env.MPESA_ENV === "sandbox"
      ? "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
      : "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

    const res = await fetch(url, { method: "GET", headers: { Authorization: auth } });
    const data = await res.json();

    if (!data.access_token) throw new Error("Failed to get access token: " + JSON.stringify(data));

    console.log("✅ OAuth token generated:", data.access_token);
    return data.access_token;
  } catch (err) {
    console.error("❌ OAuth token error:", err);
    throw err;
  }
}

// =====================
// STK Push Endpoint
// =====================
app.post("/api/stkpush", async (req, res) => {
  try {
    const { phone, amount, item } = req.body;
    if (!phone || !amount) return res.status(400).json({ error: "Phone and amount required" });

    const token = await getAccessToken();

    const timestamp = new Date().toISOString().replace(/[-T:Z.]/g, "").slice(0, 14);
    const password = Buffer.from(process.env.MPESA_SHORTCODE + process.env.MPESA_PASSKEY + timestamp).toString("base64");

    const payload = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: process.env.CALLBACK_URL,
      AccountReference: item,
      TransactionDesc: `Payment for ${item}`,
    };

    const stkRes = await fetch(
      process.env.MPESA_ENV === "sandbox"
        ? "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
        : "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await stkRes.json();
    res.json(data);
  } catch (err) {
    console.error("❌ Error during STK push:", err);
    res.status(500).json({ error: "STK push failed", details: err.message });
  }
});

// =====================
// Newsletter Subscription
// =====================
app.post("/api/newsletter", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required" });
  }

  console.log("📨 New subscription request:", email);

  const client = SibApiV3Sdk.ApiClient.instance;
  client.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

  const apiInstance = new SibApiV3Sdk.ContactsApi();
  const transactionalApi = new SibApiV3Sdk.TransactionalEmailsApi();

  const createContact = new SibApiV3Sdk.CreateContact();
  createContact.email = email;
  createContact.listIds = [parseInt(process.env.BREVO_LIST_ID)];
  createContact.updateEnabled = true;
  createContact.attributes = { FIRSTNAME: email.split("@")[0] };

  try {
    // Use Promise.race to prevent hanging if Brevo is slow
    const response = await Promise.race([
      apiInstance.createContact(createContact),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Brevo API timeout")), 10000)
      )
    ]);

    console.log("✅ New contact created:", response);

    // Send welcome email only for new subscribers
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.sender = { email: process.env.FROM_EMAIL, name: "Ujana na Ujuzi" };
    sendSmtpEmail.to = [{ email, name: email.split("@")[0] }];
    sendSmtpEmail.subject = "Welcome to Ujana na Ujuzi!";
    sendSmtpEmail.htmlContent = `
  <div style="font-family: 'Poppins', Arial, sans-serif; background-color: #ffffff; color: #333; padding: 0; margin: 0;">
    <div style="max-width: 600px; margin: auto; border-radius: 10px; overflow: hidden; border: 1px solid #e5e5e5; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
      <!-- Header -->
      <div style="background-color: #d32f2f; text-align: center; padding: 20px;">
        <img src="https://www.ujananaujuzi.org/assets/logo.png" alt="Ujana na Ujuzi Logo" style="width: 90px; height: auto; margin-bottom: 10px;" />
        <h1 style="color: #fff; font-size: 26px; margin: 0;">Welcome to Ujana na Ujuzi!</h1>
        <p style="color: #ffeaea; margin: 5px 0 0 0; font-size: 14px;">"In Speech, Conduct and Love"</p>
      </div>
      <!-- Body -->
      <div style="padding: 25px 20px; background-color: #fff;">
        <p style="font-size: 16px; line-height: 1.6;">
          Hi <strong>${email.split("@")[0]}</strong>,
        </p>
        <p style="font-size: 15px; line-height: 1.6;">
          We're thrilled to have you join our vibrant community of youth looking to make a change! 
          At <strong>Ujana na Ujuzi</strong>, we believe in empowering youth with skills, 
          opportunities, and inspiration to make a difference.
        </p>
        <p style="font-size: 15px; line-height: 1.6;">
          You’ll now be the first to know about our upcoming <strong>events</strong>, <strong>workshops</strong>, and <strong>training programs</strong>.
        </p>
        <div style="text-align: center; margin-top: 25px;">
          <a href="https://www.ujananaujuzi.org/" 
             style="background-color: #d32f2f; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold;">
             🌟 Visit Our Website
          </a>
        </div>
        <p style="font-size: 14px; color: #555; text-align: center; margin-top: 30px;">
          Let’s make impact — together.
        </p>
      </div>
      <!-- Footer -->
      <div style="background-color: #111; color: #ccc; text-align: center; padding: 15px;">
        <p style="font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Ujana na Ujuzi. All rights reserved.</p>
        <p style="font-size: 12px; margin: 5px 0 0;">Follow us on 
          <a href="https://instagram.com" style="color: #d32f2f; text-decoration: none;">Instagram</a> | 
          <a href="https://facebook.com" style="color: #d32f2f; text-decoration: none;">Facebook</a> | 
          <a href="https://www.ujananaujuzi.org/" style="color: #d32f2f; text-decoration: none;">Website</a>
        </p>
      </div>
    </div>
  </div>
`;

    await transactionalApi.sendTransacEmail(sendSmtpEmail);
    console.log("📩 Welcome email sent to:", email);

    return res.json({
      success: true,
      message: "You’re now subscribed — welcome to the community!"
    });

  } catch (error) {
    const body = error.response?.body || {};

    if (
      body.code === "duplicate_parameter" ||
      body.message?.toLowerCase().includes("exists") ||
      body.message?.toLowerCase().includes("duplicate")
    ) {
      console.log("⚠️ Already subscribed:", email);
      return res.status(200).json({
        success: true,
        message: "You’re already subscribed to our newsletter!"
      });
    }

    console.error("❌ Newsletter subscription error:", body);
    return res.status(500).json({
      success: false,
      message: "Failed to subscribe. Please try again later."
    });
  }
});



app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));