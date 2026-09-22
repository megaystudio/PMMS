/* Shared UI primitives used across every page. Kept dependency-free
   (no framework) so the app stays a pure static file — consistent with
   the blueprint's "offline first, no server" principle. */

/* Escapes free-text values before they're interpolated into an innerHTML
   template. PMMS renders a lot of user- and CSV-supplied text (asset
   names, notes, findings, RCA notes, etc.) straight into the DOM via
   innerHTML — without this, a crafted value in an imported dataset could
   inject markup/script into another user's session (self-XSS via a
   shared/handed-off CSV or backup file). Use on every plain free-text
   field rendered as text; do NOT use on values that are deliberately
   HTML (e.g. badge()/option() output, or values already escaped). */
function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function openModal(title, bodyHtml, { wide = false } = {}) {
  closeModal();
  const overlay = el(`
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal ${wide ? "modal-wide" : ""}">
        <div class="modal-head">
          <strong>${title}</strong>
          <button class="modal-close" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    </div>
  `);
  overlay.querySelector(".modal-close").addEventListener("click", closeModal);
  overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  return overlay;
}

function closeModal() {
  const existing = document.getElementById("modal-overlay");
  if (existing) existing.remove();
}

function toast(msg, kind = "success") {
  const t = el(`<div class="toast toast-${kind}">${msg}</div>`);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 250);
  }, 2400);
}

function confirmDialog(message, onYes) {
  const overlay = openModal("Confirm", `
    <p style="margin:0 0 18px;color:#3a4650">${message}</p>
    <div class="form-actions">
      <button class="button" id="confirm-no">Cancel</button>
      <button class="button danger" id="confirm-yes">Confirm</button>
    </div>
  `);
  overlay.querySelector("#confirm-no").addEventListener("click", closeModal);
  overlay.querySelector("#confirm-yes").addEventListener("click", () => {
    closeModal();
    onYes();
  });
}

const STATUS_COLOR = {
  Planned: "blue", Due: "yellow", "In Progress": "yellow", Completed: "green",
  Overdue: "red", Cancelled: "gray", Rescheduled: "gray", Closed: "gray",
  Open: "red", Running: "green", Standby: "yellow", Down: "red",
  Normal: "green", Abnormal: "red", "Not Applicable": "gray"
};
function badge(status) {
  const color = STATUS_COLOR[status] || "gray";
  return `<span class="status ${color}">${status}</span>`;
}

function criticalityBadge(c) {
  const color = c === "A" ? "red" : c === "B" ? "yellow" : "gray";
  return `<span class="status ${color}">${c}</span>`;
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(n) {
  if (n === null || n === undefined) return "—";
  return "Rp " + Number(n).toLocaleString("id-ID");
}

function openGenericImportModal({ title, templateHeaders, templateName, importFn, onDone, extraNotice }) {
  const overlay = openModal(title, `
    <div class="notice">${extraNotice || `CSV needs a header row with these columns (not all are required — see the template): <code>${templateHeaders.join(", ")}</code>`}</div>
    <div class="form-actions" style="justify-content:flex-start;margin-top:10px">
      <button class="button" id="download-template">⬇ Download Template</button>
    </div>
    <div class="import-drop" id="import-drop" style="margin-top:14px">
      Click to choose a CSV file, or drag one here
      <input type="file" id="import-file" accept=".csv,text/csv" hidden>
    </div>
    <div id="import-preview"></div>
    <div class="form-actions"><button class="button" id="cancel">Close</button></div>`);
  overlay.querySelector("#cancel").addEventListener("click", closeModal);
  overlay.querySelector("#download-template").addEventListener("click", () => {
    downloadCSV(templateName, templateHeaders.join(","));
  });
  const dropZone = overlay.querySelector("#import-drop");
  const fileInput = overlay.querySelector("#import-file");
  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("dragover", e => e.preventDefault());
  dropZone.addEventListener("drop", e => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) handleGenericImportFile(e.dataTransfer.files[0], overlay, importFn, onDone);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) handleGenericImportFile(fileInput.files[0], overlay, importFn, onDone);
  });
}

function handleGenericImportFile(file, overlay, importFn, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCSV(reader.result);
    if (!rows.length) { toast("The file appears to be empty.", "error"); return; }
    const result = importFn(rows);
    overlay.querySelector("#import-preview").innerHTML = `
      <div class="notice" style="margin-top:14px">Imported <b>${result.count}</b> of ${rows.length} row(s).</div>
      ${result.errors.length ? `<div class="card" style="margin-top:10px;background:#fdeceb"><b>Skipped rows / notes:</b><ul style="margin:8px 0 0 18px;font-size:12px">${result.errors.map(e => `<li>${e}</li>`).join("")}</ul></div>` : ""}`;
    if (result.count) toast(`${result.count} row(s) imported.`);
    if (onDone) onDone();
  };
  reader.onerror = () => toast("Could not read the file.", "error");
  reader.readAsText(file);
}

function option(value, label, selected) {
  const isSelected = selected !== undefined && selected !== null && (
    String(selected) === String(value) ||
    (!isNaN(Number(selected)) && !isNaN(Number(value)) && Number(selected) === Number(value))
  );
  return `<option value="${esc(value)}" ${isSelected ? "selected" : ""}>${esc(label)}</option>`;
}
