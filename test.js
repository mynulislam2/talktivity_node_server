const axios = require("axios");

const ACCOUNT_ID = "6b880d1f61f7e6cad93c0f55c699c2fe";
const BUCKET_NAME = "talktivity";
const API_TOKEN = "yXRB1Uo0wYreHTmdXcbG2Yyex84Fa-PPTKH1oifN";

const BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects`;

async function fetchAllObjects() {
  let allKeys = [];
  let cursor = null;
  let isTruncated = true;

  try {
    while (isTruncated) {
      const url = cursor ? `${BASE_URL}?cursor=${encodeURIComponent(cursor)}` : BASE_URL;

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          "Content-Type": "application/json",
        },
      });

      const data = response.data;

      if (!data.success) {
        throw new Error(`API error: ${JSON.stringify(data.errors)}`);
      }

      // Defensive checks
      if (!Array.isArray(data.result)) {
        console.warn("Warning: 'result' is not an array or missing:", data.result);
        break;
      }

      // Extract keys safely
      const keys = data.result.map((item) => item.key).filter(Boolean);
      allKeys = allKeys.concat(keys);

      // Check if result_info exists and has cursor & is_truncated
      if (!data.result_info) {
        console.log("No more pagination info, ending.");
        break;
      }

      cursor = data.result_info.cursor || null;
      isTruncated = data.result_info.is_truncated === true;

      // Optional: debug log
      // console.log(`Fetched ${keys.length} keys, cursor: ${cursor}, isTruncated: ${isTruncated}`);
    }

    return allKeys;
  } catch (error) {
    throw new Error(`Fetch failed: ${error.message}`);
  }
}

fetchAllObjects()
  .then((keys) => {
    console.log(JSON.stringify(keys, null, 2));
  })
  .catch((err) => {
    console.error("Error fetching objects:", err);
  });
