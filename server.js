const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 5000;

// Google Sheets setup
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = "1Mp6wTZzGW5eO3yd6shhY6PG_ADhBz-dSknBq7cF1Uy0";
const SHEET_NAME = "leads";

// Utility: Get all leads
async function getLeads() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:I`,
  });
  const rows = response.data.values || [];
  return rows.map((row, i) => ({
    index: i,
    name: row[0] || "",
    phone: row[1] || "",
    nextCallDate: row[2] || "",
    status: row[3] || "",
    lastCalled: row[4] || "",
    remarks: row[5] || "",
    followUps: row[6] || "0",
    followUpDates: row[7] || "",
    callTime: row[8] || "",
  }));
}

// Update a single row helper
async function getUpdatedRow(index) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A${index + 2}:I${index + 2}`,
  });
  return response.data.values[0];
}

// --- NEW: Get all leads ---
app.get("/api/leads", async (req, res) => {
  try {
    const leads = await getLeads();
    res.json(leads);
  } catch (err) {
    console.error("Error fetching leads:", err.response?.data || err);
    res.status(500).send("Error fetching leads");
  }
});

// --- NEW: Filter leads by nextCallDate ---
app.get("/api/filter-leads", async (req, res) => {
  try {
    const { date } = req.query;
    const leads = await getLeads();
    if (!date) return res.json(leads);

    const filtered = leads.filter((lead) => lead.nextCallDate === date);
    res.json(filtered);
  } catch (err) {
    console.error("Error filtering leads:", err.response?.data || err);
    res.status(500).send("Error filtering leads");
  }
});

// API: Update call (callTime, lastCalled, followUps)
app.post("/api/update-call/:index", async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const now = new Date();
    const todayDate = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    const callTime = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

    const leads = await getLeads();
    const lead = leads[index];

    let followUpDates = lead.followUpDates ? lead.followUpDates.split(",") : [];
    followUpDates = followUpDates.map((d) => d.trim());
    if (!followUpDates.includes(todayDate)) followUpDates.push(todayDate);
    const followUps = followUpDates.length;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!D${index + 2}:I${index + 2}`,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [
          [
            "Called",
            todayDate,
            lead.remarks || "",
            followUps,
            followUpDates.join(", "),
            callTime,
          ],
        ],
      },
    });

    const updatedRow = await getUpdatedRow(index);
    res.json({ success: true, updatedRow });
  } catch (err) {
    console.error("Error updating call:", err.response?.data || err);
    res.status(500).send("Error updating call");
  }
});

// API: Update status
app.post("/api/update-status/:index", async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const { status } = req.body;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!D${index + 2}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[status]] },
    });
    const updatedRow = await getUpdatedRow(index);
    res.json({ success: true, updatedRow });
  } catch (err) {
    console.error("Error updating status:", err.response?.data || err);
    res.status(500).send("Error updating status");
  }
});

// API: Update next call date
app.post("/api/update-next-call/:index", async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const { nextCallDate } = req.body;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!C${index + 2}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[nextCallDate]] },
    });

    const updatedRow = await getUpdatedRow(index);
    res.json({ success: true, updatedRow });
  } catch (err) {
    console.error("Error updating next call date:", err.response?.data || err);
    res.status(500).send("Error updating next call date");
  }
});

// API: Update remarks
app.post("/api/update-remarks/:index", async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const { remark } = req.body;

    const leads = await getLeads();
    const lead = leads[index];
    const now = new Date();
    const todayDate = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

    let existingRemarks = lead.remarks || "";
    const dateTag = `${todayDate} -`;
    if (existingRemarks.includes(dateTag)) {
      existingRemarks = existingRemarks.replace(
        new RegExp(`${dateTag}([^|]*)`),
        (match, p1) => `${dateTag} ${p1}/${remark}`
      );
    } else {
      existingRemarks = existingRemarks ? existingRemarks + ` | ${dateTag} ${remark}` : `${dateTag} ${remark}`;
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!F${index + 2}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[existingRemarks]] },
    });

    const updatedRow = await getUpdatedRow(index);
    res.json({ success: true, updatedRow });
  } catch (err) {
    console.error("Error updating remark:", err.response?.data || err);
    res.status(500).send("Error updating remark");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
