const express = require("express");
const axios = require("axios");
const router = express.Router();

// Replace with your real Moneybag API Key
const API_KEY = "49aa4f77.OIFEUwRiqSND68rdZJ1JCV4Hbbhh7iAzIKM1rI5bwUA";

// Flag to toggle between real API and simulation mode
const SIMULATE_PAYMENT = false;

// API Endpoint
router.post("/create-payment", async (req, res) => {
  try {
        const { customer, order_id } = req.body;

    const requestData = {
      order_id: order_id || "ORDER_" + Date.now(), // Use provided order ID or generate new one
      order_amount: 1200.0, 
      currency: "BDT",
       order_description: "Talktivity Pro Subscription - 1 Month",
      success_url: "http://localhost:3000/payment-success",
      cancel_url: "http://localhost:3000/pricing",
      fail_url: "http://localhost:3000/pricing",
      customer: {
       name: customer?.name || "Talktivity User",
        email: customer?.email || "user@example.com",
        phone: customer?.phone || "+8801712345678",
        address: customer?.address || "123 Main Street",
        city: customer?.city || "Dhaka",
        postcode: customer?.postcode || "1205",
        country: customer?.country || "BD"
      },
    };

    console.log("Sending request to Moneybag API:", requestData);

    // Simulate API response if SIMULATE_PAYMENT is true
    if (SIMULATE_PAYMENT) {
      // In simulation mode, return a fake payment URL
      const fakePaymentUrl = `http://localhost:3000/payment-success?order_id=${requestData.order_id}&amount=${requestData.order_amount}&status=Success`;
      console.log("SIMULATED: Generated fake payment URL:", fakePaymentUrl);
      return res.json({ payment_url: fakePaymentUrl });
    }

    // Real API call (only if SIMULATE_PAYMENT is false)
    const response = await axios.post(
      (process.env.MONEYBAG_API_URL || "https://sandbox.api.moneybag.com.bd/api/v2") + "/payments/checkout",
      requestData,
      {
        headers: {
          "X-Merchant-API-Key": API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Moneybag API Response:", response.data);

    // Check if response has the expected structure
    if (response.data && response.data.success && response.data.data && response.data.data.checkout_url) {
      // Send payment URL back to frontend
      res.json({ payment_url: response.data.data.checkout_url });
    } else {
      console.error("Unexpected response structure:", response.data);
      res.status(500).json({
        error: "Invalid response from payment gateway",
        response: response.data,
      });
    }
  } catch (error) {
    console.error("Moneybag API Error:", error.response?.data || error.message);
    res.status(500).json({
      error: error.response?.data || error.message || "Payment gateway error",
    });
  }
});

module.exports = router;