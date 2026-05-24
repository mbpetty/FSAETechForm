/**
 * Parse CSV text into rows of string arrays (handles quoted fields).
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      if (ch === "\r") i++;
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }

  return rows;
}

function parseCsvRecords(text) {
  const rows = parseCsv(text.trim());
  if (!rows.length) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, i) => {
      record[header] = (cells[i] ?? "").trim();
    });
    return record;
  });
}

function parseStationsField(value) {
  if (!value) return [];
  return value
    .split(/[|;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeHeader(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getField(record, ...aliases) {
  const keys = Object.keys(record);
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const key = keys.find((k) => normalizeHeader(k) === target);
    if (key !== undefined) return record[key];
  }
  return "";
}

function parseInspectionCsvText(text) {
  const records = parseCsvRecords(text);
  return records
    .map((record) => {
      const itemId = getField(record, "Item ID", "Unique ID", "ID", "item_id");
      const title = getField(record, "Title");
      const description = getField(record, "Description");
      const stationsRaw = getField(record, "Stations", "Station", "Sections", "Section");

      if (!title) return null;

      return {
        itemId: itemId || null,
        title,
        description: description || "",
        stations: parseStationsField(stationsRaw),
      };
    })
    .filter(Boolean);
}

function parseTeamCsvText(text) {
  const records = parseCsvRecords(text);
  return records
    .map((record) => {
      const carNumber = getField(record, "Car Number", "car_number", "Car #");
      const teamName = getField(record, "Team Name", "team_name", "School", "Team");
      const competition = getField(record, "Competition ID", "competition_id", "Competition");

      if (!carNumber || !teamName) return null;

      return {
        carNumber,
        teamName,
        competition: competition || DEFAULT_COMPETITION,
      };
    })
    .filter(Boolean);
}

async function readCsvFile(file) {
  return file.text();
}

function triggerCsvFilePicker(inputId) {
  document.getElementById(inputId).click();
}
