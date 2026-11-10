const eventTypeSelect = document.getElementById("event-type");
const toggleButtons = document.querySelectorAll(".button-row button");
const allButtons = document.querySelectorAll("button");

// Start/Stop buttons behave like a pair of radio buttons:
// tapping one selects it and deselects the other.
toggleButtons.forEach((button) => {
    button.setAttribute("aria-pressed", "false");

    button.addEventListener("click", () => {
        toggleButtons.forEach((other) => {
            other.setAttribute("aria-pressed", String(other === button));
        });
    });
});

// All buttons stay disabled until an event type is chosen.
function updateButtonState() {
    const hasEventType = eventTypeSelect.value !== "";
    allButtons.forEach((button) => {
        button.disabled = !hasEventType;
    });
}

eventTypeSelect.addEventListener("change", updateButtonState);
// Browsers can restore the previous selection when the user navigates
// back to the page, so re-check whenever the page is shown.
window.addEventListener("pageshow", updateButtonState);
updateButtonState();
