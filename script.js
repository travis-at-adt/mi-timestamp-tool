const eventTypeSelect = document.getElementById("event-type");
const startButton = document.getElementById("start-btn");
const stopButton = document.getElementById("stop-btn");
const submitButton = document.getElementById("submit-btn");
const downloadButton = document.getElementById("download-csv-btn");
const shareButton = document.getElementById("share-csv-btn");
const toggleButtons = [startButton, stopButton];
const eventLog = document.querySelector(".event-log");
const eventLogBody = document.getElementById("event-log-body");

// Start/Stop buttons behave like a pair of radio buttons:
// tapping one selects it and deselects the other.
toggleButtons.forEach((button) => {
    button.setAttribute("aria-pressed", "false");

    button.addEventListener("click", () => {
        toggleButtons.forEach((other) => {
            other.setAttribute("aria-pressed", String(other === button));
        });
        updateButtonState();
    });
});

// --- CSV log kept in localStorage so it survives refreshes ---
const CSV_STORAGE_KEY = "eventLogCsv";
const CSV_HEADER = "Event,Epoch_UTC\r\n";

// Quote a CSV field if it contains a comma, quote or line break.
function csvField(value) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function appendToCsv(eventText, epochSeconds) {
    try {
        const existing = localStorage.getItem(CSV_STORAGE_KEY) || CSV_HEADER;
        const line = `${csvField(eventText)},${csvField(epochSeconds)}\r\n`;
        localStorage.setItem(CSV_STORAGE_KEY, existing + line);
    } catch (err) {
        // Storage can be unavailable (private mode, blocked site data,
        // or full). The on-screen table still works either way.
        console.warn("Could not save event to localStorage CSV:", err);
    }
}

// Parse CSV text into rows of fields (handles quoted fields and "" escapes).
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (ch === '"') { inQuotes = false; }
            else { field += ch; }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ",") {
            row.push(field); field = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n") i++;
            row.push(field); rows.push(row);
            row = []; field = "";
        } else {
            field += ch;
        }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
}

// "2026-11-10T14:32:05.123Z" -> "14:32:05" (toISOString is always UTC)
function utcTimeFromEpoch(epochSeconds) {
    return new Date(epochSeconds * 1000).toISOString().slice(11, 19);
}

function addTableRow(eventText, epochSeconds) {
    const row = eventLogBody.insertRow(); // appends, so oldest stays on top
    [eventText, utcTimeFromEpoch(epochSeconds), epochSeconds].forEach((value) => {
        row.insertCell().textContent = value;
    });
    eventLog.hidden = false;
    return row;
}

// On page load, rebuild the table from the saved CSV.
function restoreTableFromCsv() {
    let saved = null;
    try {
        saved = localStorage.getItem(CSV_STORAGE_KEY);
    } catch (err) {
        console.warn("Could not read saved CSV from localStorage:", err);
    }
    if (!saved) return;

    parseCsv(saved).slice(1).forEach(([eventText, epoch]) => {
        const epochSeconds = Number(epoch);
        if (eventText && Number.isFinite(epochSeconds)) {
            addTableRow(eventText, epochSeconds);
        }
    });
}

// Build the CSV from the table so Download/Share still work even if
// localStorage is unavailable. The table and saved CSV hold the same rows.
function buildCsv() {
    const lines = Array.from(eventLogBody.rows, (row) =>
        `${csvField(row.cells[0].textContent)},${csvField(row.cells[2].textContent)}\r\n`
    );
    return CSV_HEADER + lines.join("");
}

function csvFileName() {
    const date = new Date().toISOString().slice(0, 10); // UTC date
    return `mi-timestamps-${date}.csv`;
}

function makeCsvFile() {
    return new File([buildCsv()], csvFileName(), { type: "text/csv" });
}

function selectedToggle() {
    return toggleButtons.find((b) => b.getAttribute("aria-pressed") === "true");
}

// Start/Stop need an event type; Submit also needs Start or Stop chosen.
function updateButtonState() {
    const hasEventType = eventTypeSelect.value !== "";
    toggleButtons.forEach((button) => {
        button.disabled = !hasEventType;
    });
    submitButton.disabled = !(hasEventType && selectedToggle());
}

submitButton.addEventListener("click", () => {
    const toggle = selectedToggle();
    if (eventTypeSelect.value === "" || !toggle) return;

    const now = new Date();
    const action = toggle === startButton ? "Started" : "Ended";
    const eventName = eventTypeSelect.selectedOptions[0].text;
    const epochSeconds = Math.floor(now.getTime() / 1000);
    const eventText = `${action} ${eventName}`;

    const row = addTableRow(eventText, epochSeconds);

    // CSV gets only the Event and epoch columns (no hh:mm:ss column).
    appendToCsv(eventText, epochSeconds);

    row.scrollIntoView({ block: "nearest", behavior: "smooth" });

    // Clear Start/Stop (event type is kept) so the next entry needs a
    // fresh choice; this also deactivates Submit again.
    toggleButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
    updateButtonState();
});

downloadButton.addEventListener("click", () => {
    const url = URL.createObjectURL(makeCsvFile());
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser a moment to start the download before freeing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Only show Share where the browser can actually share files.
// (Requires HTTPS or localhost; not available when opened as file://.)
function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
        return navigator.canShare({ files: [new File([""], "test.csv", { type: "text/csv" })] });
    } catch {
        return false;
    }
}

if (canShareFiles()) {
    shareButton.hidden = false;
    shareButton.addEventListener("click", async () => {
        const file = makeCsvFile();
        try {
            await navigator.share({ files: [file], title: file.name });
        } catch (err) {
            // AbortError just means the user closed the share sheet.
            if (err.name !== "AbortError") {
                console.warn("Sharing failed:", err);
                alert("Sharing failed. Try Download CSV instead.");
            }
        }
    });
}

// Wipe both the on-screen table and the saved CSV, after confirming.
document.getElementById("clear-log-btn").addEventListener("click", () => {
    const count = eventLogBody.rows.length;
    const message = `Delete all ${count} logged event${count === 1 ? "" : "s"}? ` +
        "This clears the table and the saved CSV and cannot be undone.";
    if (!confirm(message)) return;

    try {
        localStorage.removeItem(CSV_STORAGE_KEY);
    } catch (err) {
        console.warn("Could not clear saved CSV from localStorage:", err);
    }
    eventLogBody.replaceChildren();
    eventLog.hidden = true;
});

restoreTableFromCsv();

eventTypeSelect.addEventListener("change", updateButtonState);
// Browsers can restore the previous selection when the user navigates
// back to the page, so re-check whenever the page is shown.
window.addEventListener("pageshow", updateButtonState);
updateButtonState();
