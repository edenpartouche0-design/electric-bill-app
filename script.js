import * as pdfjsLib from "https://unpkg.com/pdfjs-dist@5.4.394/legacy/build/pdf.min.mjs";

const { useMemo, useState } = React;
const html = htm.bind(React.createElement);

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@5.4.394/legacy/build/pdf.worker.min.mjs";

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const emptyFields = {
  pricePerKwh: "",
  fixedCharge: "",
  powerCharge: "",
  vatRate: "",
  currentReading: "",
  previousReading: "",
};

function App() {
  const [fields, setFields] = useState(emptyFields);
  const [extractedFields, setExtractedFields] = useState(emptyFields);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("העלה חשבון חשמל בפורמט PDF כדי לחלץ נתונים אוטומטית.");
  const [parseNotes, setParseNotes] = useState([]);
  const [isParsing, setIsParsing] = useState(false);

  const calculation = useMemo(() => calculateBill(fields), [fields]);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFileName(file.name);
    setIsParsing(true);
    setStatus(`סורק את ${file.name} ומחפש תעריפים, תשלומים קבועים ומע"מ...`);
    setParseNotes([]);

    try {
      const text = await extractTextFromPdf(file);
      const parsed = parseInvoiceText(text);
      const nextFields = {
        ...emptyFields,
        ...parsed.values,
        currentReading: "",
        previousReading: "",
      };

      setFields(nextFields);
      setExtractedFields(nextFields);
      setParseNotes(parsed.notes);

      if (parsed.foundCount > 0) {
        setStatus(`החילוץ הושלם. נמצאו ${parsed.foundCount} מתוך 4 שדות מרכזיים וניתן לערוך כל ערך ידנית.`);
      } else {
        setStatus("לא זוהו שדות בצורה בטוחה. אפשר למלא את הנתונים ידנית ולהמשיך בחישוב.");
      }
    } catch (error) {
      setFields(emptyFields);
      setExtractedFields(emptyFields);
      setStatus("לא הצלחתי לקרוא את קובץ ה-PDF. נסה חשבונית אחרת או הזן את הערכים ידנית.");
      setParseNotes([error?.message || "שגיאה לא צפויה בזמן קריאת הקובץ."]);
    } finally {
      setIsParsing(false);
      event.target.value = "";
    }
  }

  function updateField(key, value) {
    setFields((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetAll() {
    setFields(emptyFields);
    setExtractedFields(emptyFields);
    setFileName("");
    setStatus("העלה חשבון חשמל בפורמט PDF כדי לחלץ נתונים אוטומטית.");
    setParseNotes([]);
    setIsParsing(false);
  }

  return html`
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">PDF + Manual Override</span>
          <h1>מחשבון חשמל חכם לדיירים</h1>
          <p>
            העלה חשבונית חשמל, חלץ אוטומטית תעריף לקוט"ש, תשלומים קבועים ומע"מ, תקן ערכים ידנית במידת הצורך
            וקבל חישוב מדויק של חלק הדייר בתשלום.
          </p>
        </div>

        <div className="hero-actions">
          <label className="upload-card">
            <input type="file" accept="application/pdf" onChange=${handleFileChange} disabled=${isParsing} />
            <span className="upload-kicker">${isParsing ? "מבצע חילוץ..." : "העלה קובץ PDF"}</span>
            <strong>${fileName || "בחר חשבונית חשמל"}</strong>
            <small>${status}</small>
          </label>

          <button className="ghost-button" type="button" onClick=${resetAll}>
            איפוס
          </button>
        </div>
      </section>

      <section className="main-grid">
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>נתונים לחישוב</h2>
              <p>השדות ממולאים אוטומטית כשאפשר, ותמיד נשארים פתוחים לעריכה ידנית.</p>
            </div>
            <span className="tag">Editable</span>
          </div>

          <div className="fields-grid">
            ${renderNumberField({
              label: 'תעריף לקוט"ש ללא מע"מ',
              value: fields.pricePerKwh,
              onInput: (value) => updateField("pricePerKwh", value),
              placeholder: "0.00",
              hint: buildFieldHint("pricePerKwh", fields, extractedFields, "₪ לקוט\"ש"),
            })}

            ${renderNumberField({
              label: "תשלום קבוע",
              value: fields.fixedCharge,
              onInput: (value) => updateField("fixedCharge", value),
              placeholder: "0.00",
              hint: buildFieldHint("fixedCharge", fields, extractedFields, "₪"),
            })}

            ${renderNumberField({
              label: "תשלום בגין הספק",
              value: fields.powerCharge,
              onInput: (value) => updateField("powerCharge", value),
              placeholder: "0.00",
              hint: buildFieldHint("powerCharge", fields, extractedFields, "₪"),
            })}

            ${renderNumberField({
              label: "אחוז מע\"מ",
              value: fields.vatRate,
              onInput: (value) => updateField("vatRate", value),
              placeholder: "17",
              hint: buildFieldHint("vatRate", fields, extractedFields, "%"),
            })}
          </div>

          <div className="meter-box">
            <div className="section-head compact">
              <div>
                <h3>קריאות מונה ידניות</h3>
                <p>מלא את שתי הקריאות כדי להשלים את החישוב.</p>
              </div>
            </div>

            <div className="fields-grid">
              ${renderNumberField({
                label: "קריאת מונה נוכחית",
                value: fields.currentReading,
                onInput: (value) => updateField("currentReading", value),
                placeholder: "0",
                hint: "מוזן ידנית",
              })}

              ${renderNumberField({
                label: "קריאת מונה קודמת",
                value: fields.previousReading,
                onInput: (value) => updateField("previousReading", value),
                placeholder: "0",
                hint: "מוזן ידנית",
              })}
            </div>
          </div>

          ${parseNotes.length > 0 && html`
            <div className="notes-box">
              <strong>סטטוס חילוץ</strong>
              <ul>
                ${parseNotes.map((note) => html`<li key=${note}>${note}</li>`)}
              </ul>
            </div>
          `}
        </section>

        <section className="summary-column">
          <article className="summary-card">
            <div className="section-head">
              <div>
                <h2>כרטיס סיכום</h2>
                <p>כל הסכומים מוצגים בדיוק של 2 ספרות אחרי הנקודה.</p>
              </div>
              <span className="tag accent">Live</span>
            </div>

            <div className="summary-list">
              ${renderSummaryRow("סה\"כ קוט\"ש שנצרך", calculation.hasReadings ? numberFormatter.format(calculation.consumption) : "—")}
              ${renderSummaryRow("עלות צריכה בשקלים", calculation.canCalculateMoney ? formatCurrency(calculation.usageCost) : "—")}
              ${renderSummaryRow("חלק יחסי בתשלומים קבועים", calculation.canCalculateMoney ? formatCurrency(calculation.relativeFixedShare) : "—")}
              ${renderSummaryRow("מע\"מ", calculation.canCalculateMoney ? formatCurrency(calculation.vatAmount) : "—")}
            </div>

            <div className="total-card">
              <span>סה"כ לתשלום לדייר (כולל מע"מ)</span>
              <strong>${calculation.canCalculateMoney ? formatCurrency(calculation.totalDue) : "₪0.00"}</strong>
            </div>

            ${calculation.errors.length > 0
              ? html`
                  <div className="validation-box">
                    ${calculation.errors.map((error) => html`<p key=${error}>${error}</p>`)}
                  </div>
                `
              : html`
                  <div className="success-box">
                    החישוב מוכן. אפשר לעדכן כל שדה ולראות את התוצאה מתרעננת מיד.
                  </div>
                `}
          </article>

          <article className="formula-card">
            <h3>לוגיקת החישוב</h3>
            <ol>
              <li>צריכה = קריאה נוכחית פחות קריאה קודמת.</li>
              <li>עלות שימוש = צריכה כפול מחיר לקוט"ש.</li>
              <li>דמי שימוש יחסיים = (תשלום קבוע + תשלום הספק) חלקי 2.</li>
              <li>מע"מ מחושב על סכום עלות השימוש ודמי השימוש היחסיים.</li>
            </ol>
          </article>
        </section>
      </section>
    </main>
  `;
}

function renderNumberField({ label, value, onInput, placeholder, hint }) {
  return html`
    <label className="field">
      <span>${label}</span>
      <input
        type="text"
        inputMode="decimal"
        value=${value}
        placeholder=${placeholder}
        onInput=${(event) => onInput(event.target.value)}
      />
      <small>${hint}</small>
    </label>
  `;
}

function renderSummaryRow(label, value) {
  return html`
    <div className="summary-row">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

async function extractTextFromPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const chunks = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    chunks.push(content.items.map((item) => item.str).join(" "));
  }

  return chunks.join("\n");
}

function parseInvoiceText(rawText) {
  const text = normalizeInvoiceText(rawText);
  const notes = [];

  const values = {
    pricePerKwh: findNumberNearLabels(text, [
      'תעריף לקוט"ש',
      "תעריף לקוטש",
      'מחיר לקוט"ש',
      "מחיר לקוטש",
      "עלות אנרגיה",
    ]),
    fixedCharge: findNumberNearLabels(text, [
      "תשלום קבוע",
      "רכיב קבוע",
      "חיוב קבוע",
    ]),
    powerCharge: findNumberNearLabels(text, [
      "תשלום בגין הספק",
      "תשלום הספק",
      "רכיב הספק",
      "חיוב הספק",
    ]),
    vatRate: findPercentNearLabels(text, [
      'מע"מ',
      "מעמ",
      "vat",
    ]),
  };

  if (!values.pricePerKwh) {
    notes.push('לא זוהה תעריף לקוט"ש באופן בטוח.');
  }

  if (!values.fixedCharge) {
    notes.push("לא זוהה תשלום קבוע באופן בטוח.");
  }

  if (!values.powerCharge) {
    notes.push("לא זוהה תשלום בגין הספק באופן בטוח.");
  }

  if (!values.vatRate) {
    notes.push('לא זוהה אחוז מע"מ באופן בטוח.');
  }

  return {
    values,
    notes,
    foundCount: Object.values(values).filter(Boolean).length,
  };
}

function normalizeInvoiceText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[“”״]/g, "\"")
    .replace(/[‘’']/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function findNumberNearLabels(text, labels) {
  for (const label of labels) {
    const normalizedLabel = label.toLowerCase();
    const index = text.indexOf(normalizedLabel);

    if (index === -1) {
      continue;
    }

    const snippet = text.slice(index, index + 120);
    const matches = snippet.match(/\d+(?:[.,]\d+)?/g);
    if (!matches) {
      continue;
    }

    const candidate = matches
      .map((match) => parseInputNumber(match))
      .find((number) => Number.isFinite(number) && number >= 0);

    if (Number.isFinite(candidate)) {
      return formatStoredNumber(candidate);
    }
  }

  return "";
}

function findPercentNearLabels(text, labels) {
  for (const label of labels) {
    const normalizedLabel = label.toLowerCase();
    const index = text.indexOf(normalizedLabel);

    if (index === -1) {
      continue;
    }

    const snippet = text.slice(index, index + 80);
    const percentMatch = snippet.match(/(\d+(?:[.,]\d+)?)\s*%?/);
    if (!percentMatch) {
      continue;
    }

    const candidate = parseInputNumber(percentMatch[1]);
    if (Number.isFinite(candidate) && candidate > 0 && candidate <= 100) {
      return formatStoredNumber(candidate);
    }
  }

  return "";
}

function calculateBill(fields) {
  const pricePerKwh = parseInputNumber(fields.pricePerKwh);
  const fixedCharge = parseInputNumber(fields.fixedCharge);
  const powerCharge = parseInputNumber(fields.powerCharge);
  const vatRate = parseInputNumber(fields.vatRate);
  const currentReading = parseInputNumber(fields.currentReading);
  const previousReading = parseInputNumber(fields.previousReading);
  const errors = [];

  const hasReadings = Number.isFinite(currentReading) && Number.isFinite(previousReading);

  if (hasReadings && currentReading < previousReading) {
    errors.push("קריאת המונה הנוכחית חייבת להיות גדולה או שווה לקריאה הקודמת.");
  }

  if (!Number.isFinite(pricePerKwh)) {
    errors.push('יש להזין תעריף לקוט"ש תקין.');
  }

  if (!Number.isFinite(fixedCharge)) {
    errors.push("יש להזין תשלום קבוע תקין.");
  }

  if (!Number.isFinite(powerCharge)) {
    errors.push("יש להזין תשלום בגין הספק תקין.");
  }

  if (!Number.isFinite(vatRate)) {
    errors.push('יש להזין אחוז מע"מ תקין.');
  }

  if (!Number.isFinite(currentReading) || !Number.isFinite(previousReading)) {
    errors.push("יש למלא קריאת מונה נוכחית וקריאת מונה קודמת.");
  }

  if (errors.length > 0) {
    return {
      hasReadings,
      canCalculateMoney: false,
      consumption: 0,
      usageCost: 0,
      relativeFixedShare: 0,
      vatAmount: 0,
      totalDue: 0,
      errors,
    };
  }

  const consumption = roundToTwo(currentReading - previousReading);
  const usageCost = roundToTwo(consumption * pricePerKwh);
  const relativeFixedShare = roundToTwo((fixedCharge + powerCharge) / 2);
  const subtotal = roundToTwo(usageCost + relativeFixedShare);
  const vatAmount = roundToTwo(subtotal * (vatRate / 100));
  const totalDue = roundToTwo(subtotal + vatAmount);

  return {
    hasReadings: true,
    canCalculateMoney: true,
    consumption,
    usageCost,
    relativeFixedShare,
    vatAmount,
    totalDue,
    errors: [],
  };
}

function buildFieldHint(key, fields, extractedFields, suffix) {
  const extracted = extractedFields[key];
  const current = fields[key];

  if (!extracted) {
    return "לא חולץ אוטומטית, אפשר להזין ידנית";
  }

  if (normalizeLooseNumber(current) !== normalizeLooseNumber(extracted)) {
    return `נערך ידנית · חולץ: ${extracted}${suffix ? ` ${suffix}` : ""}`;
  }

  return `חולץ אוטומטית · ${extracted}${suffix ? ` ${suffix}` : ""}`;
}

function normalizeLooseNumber(value) {
  const parsed = parseInputNumber(value);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function parseInputNumber(value) {
  if (value === null || value === undefined) {
    return Number.NaN;
  }

  const normalized = normalizeNumericString(value);

  if (!normalized) {
    return Number.NaN;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function roundToTwo(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatCurrency(value) {
  return currencyFormatter.format(roundToTwo(value));
}

function formatStoredNumber(value) {
  return String(roundToTwo(value));
}

function normalizeNumericString(value) {
  const cleaned = String(value)
    .replace(/[₪%\s]/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!cleaned) {
    return "";
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";

    return cleaned
      .replaceAll(thousandsSeparator, "")
      .replace(decimalSeparator, ".");
  }

  if (lastComma !== -1) {
    return cleaned.replaceAll(".", "").replace(",", ".");
  }

  return cleaned;
}

ReactDOM.createRoot(document.querySelector("#root")).render(html`<${App} />`);
