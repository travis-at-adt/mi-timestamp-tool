const eventTypeSelect = document.getElementById("event-type");
const startButton = document.getElementById("start-btn");
const stopButton = document.getElementById("stop-btn");
const downloadButton = document.getElementById("download-csv-btn");
const shareButton = document.getElementById("share-csv-btn");
const timestampButtons = [startButton, stopButton];
const eventLog = document.querySelector(".event-log");
const eventLogBody = document.getElementById("event-log-body");
const timerDisplay = document.getElementById("timer");

// --- Elapsed timer: starts on Start, freezes on Stop ---
// Uses the same epoch seconds as the logged rows, so the timer always
// matches the difference between the Start and Stop timestamps.
let timerStartEpoch = null; // epoch seconds of the running Start, or null
let timerInterval = null;

function formatElapsed(totalSeconds) {
    const s = Math.max(0, totalSeconds);
    const hours = Math.floor(s / 3600);
    const minutes = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const seconds = String(s % 60).padStart(2, "0");
    return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

function showElapsed(totalSeconds) {
    timerDisplay.textContent = formatElapsed(totalSeconds);
}

function tickTimer() {
    showElapsed(Math.floor(Date.now() / 1000) - timerStartEpoch);
}

// A new Start (including a confirmed repeat Start) restarts from 00:00.
function startTimer(epochSeconds) {
    timerStartEpoch = epochSeconds;
    clearInterval(timerInterval);
    timerInterval = setInterval(tickTimer, 250);
    timerDisplay.classList.add("running");
    tickTimer();
}

// Stop freezes the display at the Start-to-Stop duration. A repeat Stop
// while nothing is running leaves the frozen value as it is.
function stopTimer(epochSeconds) {
    if (timerStartEpoch === null) return;
    clearInterval(timerInterval);
    timerInterval = null;
    showElapsed(epochSeconds - timerStartEpoch);
    timerStartEpoch = null;
    timerDisplay.classList.remove("running");
}

function resetTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerStartEpoch = null;
    timerDisplay.classList.remove("running");
    showElapsed(0);
}

function updateTimerForEntry(eventText, epochSeconds) {
    if (eventText.startsWith("Started ")) startTimer(epochSeconds);
    else if (eventText.startsWith("Ended ")) stopTimer(epochSeconds);
}

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

// Start/Stop are only usable once an event type is chosen.
function updateButtonState() {
    const hasEventType = eventTypeSelect.value !== "";
    timestampButtons.forEach((button) => {
        button.disabled = !hasEventType;
    });
}

// Tapping Start or Stop logs the timestamp immediately.
function logTimestamp(action) {
    if (eventTypeSelect.value === "") return;

    // Capture the time of the tap before any warning dialog is shown.
    const epochSeconds = Math.floor(Date.now() / 1000);
    const eventName = eventTypeSelect.selectedOptions[0].text;
    const eventText = `${action} ${eventName}`;

    // Warn if the same button (Start or Stop) was used for the previous entry.
    const lastRow = eventLogBody.rows[eventLogBody.rows.length - 1];
    const lastEventText = lastRow ? lastRow.cells[0].textContent : "";
    if (lastEventText.startsWith(`${action} `)) {
        const buttonName = action === "Started" ? "Start" : "Stop";
        const message = `The last entry was also a ${buttonName} ("${lastEventText}").\n\n` +
            `Log another ${buttonName} anyway?`;
        if (!confirm(message)) return;
    }

    const row = addTableRow(eventText, epochSeconds);

    // CSV gets only the Event and epoch columns (no hh:mm:ss column).
    appendToCsv(eventText, epochSeconds);

    updateTimerForEntry(eventText, epochSeconds);

    row.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

startButton.addEventListener("click", () => logTimestamp("Started"));
stopButton.addEventListener("click", () => logTimestamp("Ended"));

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
    resetTimer();
});

restoreTableFromCsv();

// Replay the restored rows so a refresh mid-event keeps the timer running
// (or shows the last Start-to-Stop duration if the last entry was a Stop).
Array.from(eventLogBody.rows).forEach((row) => {
    updateTimerForEntry(row.cells[0].textContent, Number(row.cells[2].textContent));
});

eventTypeSelect.addEventListener("change", updateButtonState);
// Browsers can restore the previous selection when the user navigates
// back to the page, so re-check whenever the page is shown.
window.addEventListener("pageshow", updateButtonState);
updateButtonState();
