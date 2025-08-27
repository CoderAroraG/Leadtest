const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { google } = require("googleapis");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 5000;

// Load credentials
let credentials;
try {
  credentials = JSON.parse(fs.readFileSync("credentials.json"));
} catch (err) {
  console.error("Error reading credentials.json:", err);
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Google Sheet ID and tab name
const spreadsheetId = "1Mp6wTZzGW5eO3yd6shhY6PG_ADhBz-dSknBq7cF1Uy0";
const sheetName = "leads";

// Helper: fetch sheet data
async function getSheetData() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:H`,
  });
  return res.data.values || [];
}

// Get all leads
app.get("/api/leads", async (req, res) => {
  try {
    const rows = await getSheetData();
    if (!rows.length) return res.json([]);
    const data = rows.slice(1).map((row) => ({
      name: row[0] || "",
      phone: row[1] || "",
      nextCallDate: row[2] || "",
      status: row[3] || "",
      lastCalled: row[4] || "",
      followUps: row[5] || "",
      followUpDates: row[6] || "",
      callTime: row[7] || "",
    }));
    res.json(data);
  } catch (err) {
    console.error("Error fetching leads:", err);
    res.status(500).send("Error fetching leads");
  }
});

// Update call info
app.post("/api/update-call/:index", async (req, res) => {
  try {
    const index = parseInt(req.params.index) + 2;
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const rows = await getSheetData();
    const row = rows[index - 1];

    const now = new Date();
    const shortDate = `${now.getDate()} ${now.toLocaleString("default", { month: "short" })}`;
    const callTime = `${now.getHours()}:${now.getMinutes()}`;

    const followUps = parseInt(row[5] || 0) + 1;
    const followUpDates = row[6] ? row[6] + "," + shortDate : shortDate;

    const updatedRow = [
      row[0], // Name
      row[1], // Phone
      row[2], // Next Call Date
      "Called", // Status
      shortDate, // Last Called
      followUps.toString(), // Follow-Ups
      followUpDates, // Follow-Up Dates
      callTime, // Call Time
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${index}:H${index}`,
      valueInputOption: "RAW",
      resource: { values: [updatedRow] },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error updating call:", err);
    res.status(500).send("Error updating call");
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
