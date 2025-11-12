import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import SibApiV3Sdk from "sib-api-v3-sdk";

dotenv.config();

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://www.ujananaujuzi.org",
  "https://ujana-na-ujuzi.vercel.app"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = `The CORS policy for this site does not allow access from the specified origin.`;
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
  })
);

app.use(express.json());

const PORT = process.env.PORT || 5000;

app.post("/api/order", async (req, res) => {
  const { name, email, phone, item, quantity, size, color } = req.body;

  if (!name || !email || !phone || !item || !quantity) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required." });
  }

  console.log("📦 New order received:", req.body);

  const client = SibApiV3Sdk.ApiClient.instance;
  client.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

  const transactionalApi = new SibApiV3Sdk.TransactionalEmailsApi();

  try {
    // Calculate total
    let total = 0;
    if (item.includes("Wristband")) {
      if (size === "Small") total = 150 * quantity;
      else total = 200 * quantity;
    } else total = 2000 * quantity;

    // ------------------------------
    // 1️⃣ Send confirmation to customer
    // ------------------------------
    const customerEmail = new SibApiV3Sdk.SendSmtpEmail();
    customerEmail.sender = {
      email: process.env.FROM_EMAIL,
      name: "44 Bulldogs Store",
    };
    customerEmail.to = [{ email, name }];
    customerEmail.subject = "Your 44 Bulldogs Order Confirmation";
    customerEmail.htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Order Confirmation</title>
        <style>
          body { font-family: 'Arial', sans-serif; background-color: #f8f9fb; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; }
          .header { background: linear-gradient(90deg, #001f3f, #e50914); color: #fff; text-align: center; padding: 20px; }
          .content { padding: 20px; line-height: 1.6; }
          .order-summary { background-color: #f1f3f6; border-radius: 10px; padding: 15px; margin: 15px 0; }
          .footer { text-align: center; padding: 15px; background-color: #111; color: #bbb; font-size: 13px; }
          .payment { background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 10px; padding: 15px; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>44 Bulldogs FC Official Merch</h1>
          </div>
          <div class="content">
            <h2>Hey ${name},</h2>
            <p>Thank you for supporting <strong>44 Bulldogs FC</strong> through your merch order!</p>
            <p>Your order details are as follows:</p>
            <div class="order-summary">
              <p><strong>Item:</strong> ${item}</p>
              <p><strong>Quantity:</strong> ${quantity}</p>
              <p><strong>Size:</strong> ${size || "N/A"}</p>
              <p><strong>Color:</strong> ${color || "N/A"}</p>
              <p><strong>Total:</strong> Ksh ${total}</p>
              <p><strong>Phone:</strong> ${phone}</p>
            </div>
            <div class="payment">
              <p><strong>Next Step:</strong> To confirm your order, please make payment to:</p>
              <p>
                <strong>Paybill:</strong> 600100<br/>
                <strong>Account Number:</strong> 440047<br/>
                <strong>Account Name:</strong> Ujana na Ujuzi
              </p>
              <p>Once payment is made, your order will be processed and you’ll be notified when it’s ready for delivery or collection.</p>
            </div>
            <p style="margin-top: 20px;">
              <strong>– The 44 Bulldogs FC & Ujana na Ujuzi Team</strong><br/>
              <em>“We Are The Pack. Uma Wao!!”</em>
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Ujana na Ujuzi | All Rights Reserved</p>
            <p><a href="https://ujananaujuzi.org" target="_blank">Visit Our Website</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    await transactionalApi.sendTransacEmail(customerEmail);
    console.log("📩 Customer confirmation sent to:", email);

    // ------------------------------
    // 2️⃣ Send notification to admin (you)
    // ------------------------------
    const adminEmail = new SibApiV3Sdk.SendSmtpEmail();
    adminEmail.sender = { email: process.env.FROM_EMAIL, name: "44 Bulldogs Store" };
    adminEmail.to = [{ email: "meezlarry@gmail.com", name: "Lawrence Miringu" }];
    adminEmail.subject = `🛒 New 44 Bulldogs Order from ${name}`;
    adminEmail.htmlContent = `
      <h2>New Order Received</h2>
      <p><strong>Customer Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Item:</strong> ${item}</p>
      <p><strong>Quantity:</strong> ${quantity}</p>
      <p><strong>Size:</strong> ${size || "N/A"}</p>
      <p><strong>Color:</strong> ${color || "N/A"}</p>
      <p><strong>Total:</strong> Ksh ${total}</p>
      <p><strong>Payment:</strong> Expected via Paybill 600100 (Account 440047 – Ujana na Ujuzi)</p>
    `;

    await transactionalApi.sendTransacEmail(adminEmail);
    console.log("📧 Admin notification sent to: meezlarry@gmail.com");

    res.json({
      success: true,
      message: "Order submitted! Check your email for confirmation.",
    });
  } catch (error) {
    console.error("❌ Order email error full details:", error.response?.body || error);
    res.status(500).json({
      success: false,
      message: "Failed to send confirmation email.",
      details: error.response?.body || error.message,
    });
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
