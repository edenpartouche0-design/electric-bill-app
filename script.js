const { useMemo, useState } = React;
const html = htm.bind(React.createElement);

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

const DEFAULT_VAT_RATE = "18";
const FAMILY_PROFILES_KEY = "familyProfiles";
const FAMILY_HISTORY_KEY = "familyCalculationHistory";

const emptyFields = {
  pricePerKwhAgorot: "",
  fixedCharge: "",
  powerCharge: "",
  vatRate: DEFAULT_VAT_RATE,
  currentReading: "",
  previousReading: "",
};

function App() {
  const [fields, setFields] = useState(emptyFields);
  const [extractedFields, setExtractedFields] = useState(emptyFields);
  const [familyProfiles, setFamilyProfiles] = useState(() => loadFamilyProfiles());
  const [activeProfileId, setActiveProfileId] = useState(() => localStorage.getItem("activeFamilyProfileId") || "");
  const [familyHistory, setFamilyHistory] = useState(() => loadFamilyHistory());
  const [isAddingProfile, setIsAddingProfile] = useState(false);
  const [newProfile, setNewProfile] = useState({ firstName: "", lastName: "" });
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("העלה חשבון חשמל בפורמט PDF כדי לחלץ נתונים אוטומטית.");
  const [parseNotes, setParseNotes] = useState([]);
  const [isParsing, setIsParsing] = useState(false);
  const [calculationResult, setCalculationResult] = useState(null);
  const [requiresRecalculation, setRequiresRecalculation] = useState(true);

  const relativeFixedSharePreview = useMemo(() => getRelativeFixedSharePreview(fields), [fields]);
  const consumptionPreview = useMemo(() => getConsumptionPreview(fields), [fields]);
  const activeProfile = useMemo(
    () => familyProfiles.find((profile) => profile.id === activeProfileId) || null,
    [familyProfiles, activeProfileId],
  );
  const activeProfileHistory = useMemo(
    () => activeProfile ? familyHistory[activeProfile.id] || [] : [],
    [activeProfile, familyHistory],
  );

  function handleAddProfile(event) {
    event.preventDefault();

    const firstName = newProfile.firstName.trim();
    const lastName = newProfile.lastName.trim();
    if (!firstName || !lastName) {
      return;
    }

    const profile = {
      id: createProfileId(),
      firstName,
      lastName,
      createdAt: new Date().toISOString(),
    };
    const nextProfiles = [...familyProfiles, profile];
    saveFamilyProfiles(nextProfiles);
    setFamilyProfiles(nextProfiles);
    setActiveProfileId(profile.id);
    localStorage.setItem("activeFamilyProfileId", profile.id);
    setNewProfile({ firstName: "", lastName: "" });
    setIsAddingProfile(false);
  }

  function selectProfile(profileId) {
    setActiveProfileId(profileId);
    localStorage.setItem("activeFamilyProfileId", profileId);
  }

  function deleteProfile(profile, event) {
    event.stopPropagation();

    if (!confirm(`למחוק את הפרופיל של ${getProfileName(profile)}?`)) {
      return;
    }

    const nextProfiles = familyProfiles.filter((item) => item.id !== profile.id);
    const nextHistory = { ...familyHistory };
    delete nextHistory[profile.id];

    saveFamilyProfiles(nextProfiles);
    saveFamilyHistory(nextHistory);
    setFamilyProfiles(nextProfiles);
    setFamilyHistory(nextHistory);

    if (activeProfileId === profile.id) {
      const nextActiveId = nextProfiles[0]?.id || "";
      setActiveProfileId(nextActiveId);
      if (nextActiveId) {
        localStorage.setItem("activeFamilyProfileId", nextActiveId);
      } else {
        localStorage.removeItem("activeFamilyProfileId");
      }
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFileName(file.name);
    setIsParsing(true);
    setStatus(`סורק את ${file.name} ומחפש מחיר לקוט"ש באגורות, תשלומים קבועים ומע"מ...`);
    setParseNotes([]);

    try {
      const invoiceData = await extractInvoiceDataFromPdf(file);
      const parsed = parseInvoiceText(invoiceData);
      setFields((current) => ({
        ...current,
        ...parsed.values,
        vatRate: parsed.values.vatRate || current.vatRate || DEFAULT_VAT_RATE,
      }));
      setExtractedFields((current) => ({
        ...current,
        ...parsed.values,
        vatRate: parsed.values.vatRate || current.vatRate || DEFAULT_VAT_RATE,
      }));
      setParseNotes(parsed.notes);
      setRequiresRecalculation(true);

      if (parsed.foundCount > 0) {
        setStatus(`החילוץ הושלם. נמצאו ${parsed.foundCount} מתוך 4 שדות מרכזיים וניתן לערוך כל ערך ידנית.`);
      } else {
        setStatus("לא זוהו שדות בצורה בטוחה. אפשר למלא את הנתונים ידנית ולהמשיך בחישוב.");
      }
    } catch (error) {
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
    setRequiresRecalculation(true);
  }

  function handleCalculate() {
    const result = calculateBill(fields);
    setCalculationResult(result);
    setRequiresRecalculation(false);

    if (activeProfile && result.canCalculateMoney) {
      const entry = {
        id: createProfileId(),
        calculatedAt: new Date().toISOString(),
        fields: { ...fields },
        result,
      };
      const nextHistory = {
        ...familyHistory,
        [activeProfile.id]: [entry, ...(familyHistory[activeProfile.id] || [])],
      };
      saveFamilyHistory(nextHistory);
      setFamilyHistory(nextHistory);
    }
  }

  function resetAll() {
    setFields(emptyFields);
    setExtractedFields(emptyFields);
    setFileName("");
    setStatus("העלה חשבון חשמל בפורמט PDF כדי לחלץ נתונים אוטומטית.");
    setParseNotes([]);
    setIsParsing(false);
    setCalculationResult(null);
    setRequiresRecalculation(true);
  }

  return html`
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">PDF + Manual Override</span>
          <h1>מחשבון חשמל חכם לדיירים</h1>
          <p>
            העלה חשבונית חשמל, חלץ אוטומטית מחיר לקוט"ש באגורות, תשלומים קבועים ומע"מ, תקן ערכים ידנית
            במידת הצורך וקבל חישוב מדויק של חלק הדייר בתשלום.
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
              <p>
                ${activeProfile
                  ? `פרופיל פעיל: ${getProfileName(activeProfile)}`
                  : "בחר בן משפחה כדי לשמור את היסטוריית החישובים שלו."}
              </p>
            </div>
            <span className="tag">Editable</span>
          </div>

          <section className="family-profiles" aria-label="פרופילים משפחתיים">
            <div className="family-actions">
              <button className="ghost-button compact-button" type="button" onClick=${() => setIsAddingProfile((value) => !value)}>
                הוסף בן משפחה
              </button>
            </div>

            ${isAddingProfile && html`
              <form className="profile-form" onSubmit=${handleAddProfile}>
                <input
                  type="text"
                  value=${newProfile.firstName}
                  placeholder="שם פרטי"
                  onInput=${(event) => setNewProfile((current) => ({ ...current, firstName: event.target.value }))}
                />
                <input
                  type="text"
                  value=${newProfile.lastName}
                  placeholder="שם משפחה"
                  onInput=${(event) => setNewProfile((current) => ({ ...current, lastName: event.target.value }))}
                />
                <button className="profile-save-button" type="submit">שמור</button>
              </form>
            `}

            ${familyProfiles.length > 0 && html`
              <div className="profile-chip-list">
                ${familyProfiles.map((profile) => html`
                  <span
                    key=${profile.id}
                    className=${`profile-chip ${profile.id === activeProfileId ? "active" : ""}`}
                  >
                    <button className="profile-select-button" type="button" onClick=${() => selectProfile(profile.id)}>
                      ${getProfileName(profile)}
                    </button>
                    <button
                      className="delete-profile"
                      type="button"
                      aria-label=${`מחק את ${getProfileName(profile)}`}
                      onClick=${(event) => deleteProfile(profile, event)}
                    >
                      ×
                    </button>
                  </span>
                `)}
              </div>
            `}
          </section>

          <div className="fields-grid">
            ${renderNumberField({
              label: 'מחיר\nלקוט"ש\nבאגורות',
              value: fields.pricePerKwhAgorot,
              onInput: (value) => updateField("pricePerKwhAgorot", value),
              placeholder: "0.00",
              hint: buildFieldHint("pricePerKwhAgorot", fields, extractedFields, "אג׳ לקוט\"ש"),
            })}

            ${renderNumberField({
              label: "תשלום קבוע",
              value: fields.fixedCharge,
              onInput: (value) => updateField("fixedCharge", value),
              placeholder: "0.00",
              hint: buildFieldHint("fixedCharge", fields, extractedFields, "₪"),
            })}

            ${renderNumberField({
              label: 'תשלום בגין הספק (KVA)',
              value: fields.powerCharge,
              onInput: (value) => updateField("powerCharge", value),
              placeholder: "0.00",
              hint: buildFieldHint("powerCharge", fields, extractedFields, "₪"),
            })}

            ${renderNumberField({
              label: "אחוז מע\"מ",
              value: fields.vatRate,
              onInput: (value) => updateField("vatRate", value),
              placeholder: DEFAULT_VAT_RATE,
              hint: buildFieldHint("vatRate", fields, extractedFields, "%"),
            })}

            ${renderReadOnlyField({
              label: "חישוב חלק יחסי תשלומים קבועים",
              value: relativeFixedSharePreview,
              hint: "מחצית מהסכום של תשלום קבוע ותשלום בגין הספק",
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

              ${renderReadOnlyField({
                label: 'סה"כ צריכה',
                value: consumptionPreview,
                hint: "מחושב אוטומטית כהפרש בין קריאת המונה הנוכחית לקודמת",
              })}
            </div>
          </div>

          <button className="calculate-button" type="button" onClick=${handleCalculate}>
            חשב
          </button>

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
                <p>כל הסכומים מוצגים בדיוק של 2 ספרות אחרי הנקודה, אחרי לחיצה על כפתור חשב.</p>
              </div>
              <span className="tag accent">Live</span>
            </div>

            <div className="summary-list">
              ${renderSummaryRow('סה"כ קוט"ש שנצרך', calculationResult?.hasReadings ? numberFormatter.format(calculationResult.consumption) : "—")}
              ${renderSummaryRow("עלות צריכה בשקלים", calculationResult?.canCalculateMoney ? formatCurrency(calculationResult.usageCost) : "—")}
              ${renderSummaryRow("חלק יחסי בתשלומים קבועים", calculationResult?.canCalculateMoney ? formatCurrency(calculationResult.relativeFixedShare) : "—")}
              ${renderSummaryRow('מע"מ', calculationResult?.canCalculateMoney ? formatCurrency(calculationResult.vatAmount) : "—")}
            </div>

            <div className="total-card">
              <span>סה"כ לתשלום לדייר (כולל מע"מ)</span>
              <strong>${calculationResult?.canCalculateMoney ? formatCurrency(calculationResult.totalDue) : "₪0.00"}</strong>
            </div>

            ${!calculationResult
              ? html`
                  <div className="success-box">
                    מלאי או עדכני את הנתונים, ואז לחצי על כפתור חשב כדי להציג את התוצאה.
                  </div>
                `
              : requiresRecalculation
                ? html`
                    <div className="validation-box">
                      <p>הנתונים השתנו מאז החישוב האחרון. לחצי שוב על כפתור חשב כדי לעדכן את התוצאה.</p>
                    </div>
                  `
                : calculationResult.errors.length > 0
              ? html`
                  <div className="validation-box">
                    ${calculationResult.errors.map((error) => html`<p key=${error}>${error}</p>`)}
                  </div>
                `
              : html`
                  <div className="success-box">
                    החישוב מוכן. אפשר לעדכן שדות, ואז ללחוץ שוב על כפתור חשב כדי לרענן את התוצאה.
                  </div>
                `}

            ${activeProfile && activeProfileHistory.length > 0 && html`
              <div className="history-box">
                <strong>היסטוריה של ${getProfileName(activeProfile)}</strong>
                ${activeProfileHistory.slice(0, 5).map((entry) => html`
                  <div className="history-row" key=${entry.id}>
                    <span>${formatHistoryDate(entry.calculatedAt)}</span>
                    <strong>${formatCurrency(entry.result.totalDue)}</strong>
                  </div>
                `)}
              </div>
            `}
          </article>

          <article className="formula-card">
            <h3>לוגיקת החישוב</h3>
            <ol>
              <li>צריכה = קריאה נוכחית פחות קריאה קודמת.</li>
              <li>עלות שימוש = צריכה כפול מחיר לקוט"ש באגורות, ואז המרה לשקלים.</li>
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

function renderReadOnlyField({ label, value, hint }) {
  return html`
    <label className="field">
      <span>${label}</span>
      <input type="text" value=${value} readonly disabled />
      <small>${hint}</small>
    </label>
  `;
}

function loadFamilyProfiles() {
  try {
    const profiles = JSON.parse(localStorage.getItem(FAMILY_PROFILES_KEY) || "[]");
    return Array.isArray(profiles)
      ? profiles.filter((profile) => profile?.id && profile?.firstName && profile?.lastName)
      : [];
  } catch {
    return [];
  }
}

function saveFamilyProfiles(profiles) {
  localStorage.setItem(FAMILY_PROFILES_KEY, JSON.stringify(profiles));
}

function loadFamilyHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(FAMILY_HISTORY_KEY) || "{}");
    return history && typeof history === "object" && !Array.isArray(history) ? history : {};
  } catch {
    return {};
  }
}

function saveFamilyHistory(history) {
  localStorage.setItem(FAMILY_HISTORY_KEY, JSON.stringify(history));
}

function createProfileId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getProfileName(profile) {
  return `${profile.firstName} ${profile.lastName}`.trim();
}

function formatHistoryDate(value) {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function extractInvoiceDataFromPdf(file) {
  const pdfjsLib = await ensurePdfJsLoaded();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await loadPdfDocument(pdfjsLib, data);
  const chunks = [];
  let page2Items = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    });
    chunks.push(content.items.map((item) => item.str).join(" "));

    if (pageNumber === 2) {
      page2Items = content.items
        .map((item) => ({
          str: String(item.str || ""),
          x: item.transform?.[4] || 0,
          y: item.transform?.[5] || 0,
          width: item.width || 0,
          height: item.height || Math.abs(item.transform?.[3] || 0) || 0,
        }))
        .filter((item) => item.str.trim());
    }
  }

  return {
    text: chunks.join("\n"),
    page2Items,
  };
}

function ensurePdfJsLoaded() {
  if (globalThis.pdfjsLib) {
    globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
    return Promise.resolve(globalThis.pdfjsLib);
  }

  return Promise.reject(new Error("ספריית PDF.js המקומית לא נטענה."));
}

async function loadPdfDocument(pdfjsLib, data) {
  const attempts = [
    {
      data,
      disableWorker: true,
      isEvalSupported: false,
      useWorkerFetch: false,
      stopAtErrors: false,
    },
    {
      data,
      disableWorker: true,
      isEvalSupported: true,
      useWorkerFetch: false,
      stopAtErrors: false,
    },
  ];

  let lastError = null;

  for (const options of attempts) {
    try {
      return await pdfjsLib.getDocument(options).promise;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`קריאת ה-PDF נכשלה: ${lastError?.message || "לא ניתן לקרוא את הקובץ."}`);
}

function parseInvoiceText(invoiceData) {
  const text = normalizeInvoiceText(invoiceData?.text || invoiceData || "");
  const notes = [];
  const pricePerKwhAgorot = extractPricePerKwhFromPage2(invoiceData?.page2Items || []);

  const values = {
    pricePerKwhAgorot,
    fixedCharge: findNumberNearLabels(text, [
      "תשלום קבוע",
      "תשלום קבוע:",
      "תשלום קבוע",
      "רכיב קבוע",
      "חיוב קבוע",
    ]),
    powerCharge: findNumberNearLabels(text, [
      "תשלום בגין הספק (kva)",
      "תשלום בגין הספק(kva)",
      "תשלום בגין הספק kva",
      "תשלום בגין הספק",
      "תשלום הספק",
      "רכיב הספק",
      "חיוב הספק",
    ]),
    vatRate: findPercentNearLabels(text, [
      'מע"מ %',
      'מע"מ%',
      'מעמ %',
      'מעמ%',
      'vat %',
      'vat%',
      'מע"מ',
      "מעמ",
      "vat",
    ]),
  };

  if (!values.pricePerKwhAgorot) {
    notes.push('לא זוהה מחיר לקוט"ש באגורות מעמוד 2 באופן בטוח. השדה לא מולא כדי להימנע מערך שגוי.');
  }

  if (!values.fixedCharge) {
    notes.push("לא זוהה תשלום קבוע באופן בטוח.");
  }

  if (!values.powerCharge) {
    notes.push("לא זוהה תשלום בגין הספק באופן בטוח.");
  }

  if (!values.vatRate) {
    notes.push('לא זוהה אחוז מע"מ מהשדה של מע"מ % באופן בטוח.');
  }

  return {
    values,
    notes,
    foundCount: Object.values(values).filter(Boolean).length,
  };
}

function extractPricePerKwhFromPage2(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }

  const anchor = findPage2AgorotAnchor(items);
  if (anchor) {
    const anchoredValue = findDecimalBelowAnchor(items, anchor);
    if (anchoredValue) {
      return anchoredValue;
    }
  }

  return findFallbackPriceInConsumptionTable(items);
}

function findPage2AgorotAnchor(items) {
  const candidates = items.filter((item) => {
    const text = normalizeInvoiceText(item.str);
    const reversedText = normalizeInvoiceText(reverseText(item.str));
    return (
      text.includes("באגורות") ||
      reversedText.includes("באגורות") ||
      text.includes('מחיר לקוט"ש') ||
      reversedText.includes('מחיר לקוט"ש') ||
      text.includes("ש\"טוקל ריחמ") ||
      reversedText.includes("ש\"טוקל ריחמ")
    );
  });

  if (candidates.length === 0) {
    return null;
  }

  const tableTitle = findConsumptionTableTitle(items);
  const titleY = tableTitle?.y;
  const belowTitle = candidates.filter((item) => !Number.isFinite(titleY) || item.y < titleY);
  const pool = belowTitle.length > 0 ? belowTitle : candidates;

  return pool.reduce((best, item) => {
    const bestText = normalizeInvoiceText(best.str);
    const itemText = normalizeInvoiceText(item.str);
    const bestScore = (bestText.includes("באגורות") ? 0 : 20) + Math.abs(best.y - (titleY || best.y));
    const itemScore = (itemText.includes("באגורות") ? 0 : 20) + Math.abs(item.y - (titleY || item.y));
    return itemScore < bestScore ? item : best;
  });
}

function findDecimalBelowAnchor(items, anchor) {
  const anchorCenterX = getItemCenterX(anchor);
  const anchorBottomY = anchor.y - Math.max(anchor.height, 8);

  const candidates = items
    .map((item) => ({
      item,
      value: parsePriceCandidate(item.str),
      xDistance: Math.abs(getItemCenterX(item) - anchorCenterX),
      yDistance: anchorBottomY - item.y,
    }))
    .filter(({ value, xDistance, yDistance }) => (
      value &&
      yDistance >= -8 &&
      yDistance <= 220 &&
      xDistance <= Math.max(90, anchor.width + 40)
    ))
    .sort((a, b) => {
      const rowScoreA = Math.abs(a.yDistance - 28);
      const rowScoreB = Math.abs(b.yDistance - 28);
      return (a.xDistance + rowScoreA) - (b.xDistance + rowScoreB);
    });

  return candidates[0]?.value || "";
}

function findFallbackPriceInConsumptionTable(items) {
  const tableTitle = findConsumptionTableTitle(items);
  if (!tableTitle) {
    return "";
  }

  const header = findPage2AgorotAnchor(items);
  const maxY = header ? header.y + 8 : tableTitle.y;
  const minY = header ? header.y - 180 : tableTitle.y - 260;
  const rows = groupItemsByRow(items.filter((item) => item.y <= maxY && item.y >= minY));

  for (const row of rows) {
    const rowText = normalizeInvoiceText(row.map((item) => item.str).join(" "));
    const reversedRowText = normalizeInvoiceText(reverseText(row.map((item) => item.str).join(" ")));

    if (rowText.includes("באגורות") || reversedRowText.includes("באגורות")) {
      continue;
    }

    const values = uniqueValues(row.map((item) => parsePriceCandidate(item.str)).filter(Boolean));
    if (values.length === 1) {
      return values[0];
    }
  }

  return "";
}

function findConsumptionTableTitle(items) {
  return items.find((item) => {
    const text = normalizeInvoiceText(item.str);
    const reversedText = normalizeInvoiceText(reverseText(item.str));
    return (
      text.includes('חיוב בגין צריכה מחח"י') ||
      reversedText.includes('חיוב בגין צריכה מחח"י') ||
      text.includes("י\"חחמ הכירצ ןיגב בויח") ||
      reversedText.includes("י\"חחמ הכירצ ןיגב בויח")
    );
  }) || null;
}

function parsePriceCandidate(value) {
  const match = String(value || "").match(/(^|[^\d])(\d{2,3}[.,]\d{2})(?!\d)/);
  if (!match) {
    return "";
  }

  const parsed = parseInputNumber(match[2]);
  if (!Number.isFinite(parsed) || parsed < 20 || parsed > 120) {
    return "";
  }

  return formatStoredNumber(parsed);
}

function groupItemsByRow(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const rows = [];

  for (const item of sorted) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 4);
    if (row) {
      row.items.push(item);
      row.y = (row.y + item.y) / 2;
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  return rows.map((row) => row.items.sort((a, b) => a.x - b.x));
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function getItemCenterX(item) {
  return item.x + (item.width / 2);
}

function reverseText(value) {
  return String(value || "").split("").reverse().join("");
}

function normalizeInvoiceText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[“”״]/g, "\"")
    .replace(/[‘’']/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function findNumberNearLabels(text, labels, options = {}) {
  for (const label of labels) {
    const normalizedLabel = label.toLowerCase();
    const index = text.indexOf(normalizedLabel);

    if (index === -1) {
      continue;
    }

    const candidate = findClosestNumberAroundIndex(text, index, normalizedLabel.length, options);

    if (Number.isFinite(candidate)) {
      return formatStoredNumber(candidate);
    }
  }

  return "";
}

function findClosestNumberAroundIndex(text, index, labelLength, options = {}) {
  const start = Math.max(0, index - 140);
  const end = Math.min(text.length, index + labelLength + 140);
  const snippet = text.slice(start, end);
  const matches = [...snippet.matchAll(/\d+(?:[.,]\d+)?/g)];

  if (matches.length === 0) {
    return Number.NaN;
  }

  let bestNumber = Number.NaN;
  let bestScore = Number.POSITIVE_INFINITY;
  const labelCenter = index - start + (labelLength / 2);

  for (const match of matches) {
    const rawValue = match[0];
    const parsedValue = parseInputNumber(rawValue);

    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      continue;
    }

    if (Number.isFinite(options.min) && parsedValue < options.min) {
      continue;
    }

    if (Number.isFinite(options.max) && parsedValue > options.max) {
      continue;
    }

    const isDecimal = /[.,]/.test(rawValue);
    if (options.avoidSmallIntegers && !isDecimal && parsedValue <= 9) {
      continue;
    }

    const matchCenter = (match.index || 0) + (rawValue.length / 2);
    const distance = Math.abs(matchCenter - labelCenter);
    let score = distance;

    if (options.preferDecimal) {
      score += isDecimal ? -80 : 80;
    }

    if (options.preferTwoFractionDigits) {
      score += /[.,]\d{2}$/.test(rawValue) ? -60 : 40;
    }

    if (rawValue.length >= 4) {
      score -= 10;
    }

    if (score < bestScore) {
      bestScore = score;
      bestNumber = parsedValue;
    }
  }

  return bestNumber;
}

function findPercentNearLabels(text, labels) {
  for (const label of labels) {
    const normalizedLabel = label.toLowerCase();
    const index = text.indexOf(normalizedLabel);

    if (index === -1) {
      continue;
    }

    const directPercentCandidate = findPercentCandidateAroundIndex(text, index, normalizedLabel.length);
    if (Number.isFinite(directPercentCandidate) && directPercentCandidate > 0 && directPercentCandidate <= 100) {
      return formatStoredNumber(directPercentCandidate);
    }

    const candidate = findClosestNumberAroundIndex(text, index, normalizedLabel.length);
    if (Number.isFinite(candidate) && candidate > 0 && candidate <= 100) {
      return formatStoredNumber(candidate);
    }
  }

  return "";
}

function findPercentCandidateAroundIndex(text, index, labelLength) {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + labelLength + 80);
  const snippet = text.slice(start, end);

  const beforeMatches = [...snippet.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)];
  if (beforeMatches.length > 0) {
    const lastMatch = beforeMatches[beforeMatches.length - 1][1];
    return parseInputNumber(lastMatch);
  }

  const explicitPercentMatches = [...snippet.matchAll(/%+\s*(\d+(?:[.,]\d+)?)/g)];
  if (explicitPercentMatches.length > 0) {
    return parseInputNumber(explicitPercentMatches[0][1]);
  }

  return Number.NaN;
}

function calculateBill(fields) {
  const pricePerKwhAgorot = parseInputNumber(fields.pricePerKwhAgorot);
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

  if (!Number.isFinite(pricePerKwhAgorot)) {
    errors.push('יש להזין מחיר לקוט"ש. הערך צריך להיות באגורות.');
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

  const consumptionRaw = currentReading - previousReading;
  const usageCostRaw = consumptionRaw * convertAgorotToShekels(pricePerKwhAgorot);
  const relativeFixedShareRaw = (fixedCharge + powerCharge) / 2;
  const subtotalRaw = usageCostRaw + relativeFixedShareRaw;
  const vatAmountRaw = subtotalRaw * (vatRate / 100);
  const totalDueRaw = subtotalRaw + vatAmountRaw;

  const consumption = roundToTwo(consumptionRaw);
  const usageCost = roundToTwo(usageCostRaw);
  const relativeFixedShare = roundToTwo(relativeFixedShareRaw);
  const vatAmount = roundToTwo(vatAmountRaw);
  const totalDue = roundToTwo(totalDueRaw);

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

function getRelativeFixedSharePreview(fields) {
  const fixedCharge = parseInputNumber(fields.fixedCharge);
  const powerCharge = parseInputNumber(fields.powerCharge);

  if (!Number.isFinite(fixedCharge) || !Number.isFinite(powerCharge)) {
    return "";
  }

  return formatCurrency((fixedCharge + powerCharge) / 2);
}

function getConsumptionPreview(fields) {
  const currentReading = parseInputNumber(fields.currentReading);
  const previousReading = parseInputNumber(fields.previousReading);

  if (!Number.isFinite(currentReading) || !Number.isFinite(previousReading)) {
    return "";
  }

  if (currentReading < previousReading) {
    return "";
  }

  return numberFormatter.format(currentReading - previousReading);
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

function convertAgorotToShekels(value) {
  return value / 100;
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
