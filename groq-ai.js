const axios = require("axios");

// Analyze conversations with Groq LLM API
async function analyzeWithGroq(conversations) {
  // Format the conversation for the Groq API
  const formattedMessages = [
    {
      role: "system",
      content: `Analyze the following English conversation data and return a JSON object with these properties:
- fluency: 0-100
- vocabulary: 0-100
- grammar: 0-100
- feedback: 1-2 sentences of constructive feedback

Base your analysis ONLY on the provided conversation turns. Output valid JSON only.`,
    },
    ...conversations.map((conv) => ({
      role: "user",
      content:
        typeof conv.transcript === "string"
          ? conv.transcript
          : JSON.stringify(conv.transcript),
    })),
  ];

  const payload = {
    model: "deepseek-r1-distill-llama-70b",
    messages: formattedMessages,
    temperature: 0.7,
    max_tokens: 512,
  };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set in environment");

  const url = "https://api.groq.com/openai/v1/chat/completions";
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  try {
    const response = await axios.post(url, payload, { headers });
    if (response.data.choices && response.data.choices.length > 0) {
      const contentString = response.data.choices[0].message.content;
      // Try to parse the JSON from the response
      return JSON.parse(contentString);
    } else {
      throw new Error("No response content from Groq API");
    }
  } catch (error) {
    console.error("Groq API error:", error.message);
    throw error;
  }
}

module.exports = { analyzeWithGroq };
