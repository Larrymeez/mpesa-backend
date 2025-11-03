import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

async function testNewsletter() {
  try {
    const email = "testuser" + Date.now() + "@example.com"; // unique test email

    const res = await fetch(`${process.env.VITE_API_URL}/api/newsletter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    console.log("Response:", data);
  } catch (err) {
    console.error("Error testing newsletter:", err);
  }
}

testNewsletter();
