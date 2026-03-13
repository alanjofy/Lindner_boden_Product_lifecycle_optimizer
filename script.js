// =======================================================
// GLOBAL STATE
// =======================================================

const AppState = {
    floor: [],
    pedestal: [],
    pedestalMap: [],
    reuseMap: [],
    scenarioMap: [],
    selectedScenarioColumn: null,
    competitorMap: [],
    competitorImpacts: [],
    productLinks: [],
    bnpSelectedScenarioColumn: null,
    selectedStrategyType: null,
    appMode: 'renovation'
};

let chartInstance = null;
let bnpChartInstance = null;
let bnpCompetitorChartInstance = null;

// =======================================================
// PRODUCT IMAGE — driven entirely from floor_links.csv
// To add/remove images: edit the "Image" column in
// floor_links.csv. No code changes needed.
// =======================================================

function getProductImage(productName) {
    if (!productName) return null;
    const normalize = s => s ? s.trim().toLowerCase() : "";
    const row = AppState.productLinks.find(r =>
        normalize(r["Product"] || r["product"]) === normalize(productName)
    );
    if (!row) return null;
    const imgPath = row["Image"] || row["image"] || "";
    return imgPath.trim() || null;
}

function updateProductImage(productName, imgId, placeholderId) {
    const img = document.getElementById(imgId);
    const placeholder = document.getElementById(placeholderId);
    // Show the wrapper div (parent of both)
    const wrapper = img ? img.closest('[id$="-img-wrapper"]') : null;

    if (!img || !placeholder) return;

    if (!productName) {
        // Hide entire wrapper when no product selected
        if (wrapper) wrapper.style.display = 'none';
        img.style.display = 'none';
        return;
    }

    // Show wrapper now that a product is selected
    if (wrapper) wrapper.style.display = 'block';

    const src = getProductImage(productName);
    if (src) {
        img.src = src;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        img.style.display = 'none';
        placeholder.style.display = 'flex';
        placeholder.textContent = productName.toUpperCase();
    }
}

// =======================================================
// CSV PARSER
// =======================================================

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
    const headers = splitLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').trim());
    return lines.slice(1).map(line => {
        const values = splitLine(line);
        const obj = {};
        headers.forEach((h, i) => obj[h.trim()] = values[i] ? values[i].trim() : "");
        return obj;
    });
}

function splitLine(line) {
    const result = [];
    let current = "", inQuotes = false;
    for (let char of line) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) { result.push(current); current = ""; }
        else current += char;
    }
    result.push(current);
    return result.map(v => v.replace(/^"|"$/g, ""));
}

// =======================================================
// INIT
// =======================================================

document.addEventListener("DOMContentLoaded", init);

async function init() {
    try {
        const [
            floorText, pedestalText, pedMapText, reuseText,
            scenarioText, compMapText, compImpactsText, floorLinkText
        ] = await Promise.all([
            fetch("floorimpacts.csv").then(r => r.text()),
            fetch("pedestal_impacts.csv").then(r => r.text()),
            fetch("floor_pedestal_map.csv").then(r => r.text()),
            fetch("existing_new_map.csv").then(r => r.text()),
            fetch("floorscenario.csv").then(r => r.text()),
            fetch("floor_comparison_map.csv").then(r => r.text()),
            fetch("floor_comparison_impacts.csv").then(r => r.text()),
            fetch("floor_links.csv").then(r => r.text())
        ]);

        AppState.floor = parseCSV(floorText);
        AppState.pedestal = parseCSV(pedestalText);
        AppState.pedestalMap = parseCSV(pedMapText);
        AppState.reuseMap = parseCSV(reuseText);
        AppState.scenarioMap = parseCSV(scenarioText);
        AppState.competitorMap = parseCSV(compMapText);
        AppState.competitorImpacts = parseCSV(compImpactsText);
        AppState.productLinks = parseCSV(floorLinkText);

        initBaseProducts();
        initNewPurchaseProducts();
        initBuyNewBaseProducts();
        attachListeners();
        attachBuyNewListeners();
        initTogglePills();

    } catch (error) {
        console.error("Initialization Error:", error);
        alert("Failed to load data files. Please ensure you are running a local web server (e.g., python -m http.server).");
    }
}

// =======================================================
// TOGGLE PILLS (visual checkbox pills)
// =======================================================

function initTogglePills() {
    document.querySelectorAll('.toggle-pill').forEach(pill => {
        const checkbox = pill.querySelector('input[type="checkbox"]');
        if (!checkbox) return;

        function syncPill() {
            pill.classList.toggle('checked', checkbox.checked);
        }

        checkbox.addEventListener('change', syncPill);
        syncPill(); // Initial sync
    });
}

// =======================================================
// MODE SWITCHING
// =======================================================

window.switchMode = function(mode) {
    AppState.appMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
        const text = btn.textContent.toLowerCase();
        if (mode === 'renovation' && text.includes('renovation')) btn.classList.add('active');
        else if (mode === 'newPurchase' && text.includes('comparison')) btn.classList.add('active');
        else if (mode === 'buyNew' && text.includes('buy new')) btn.classList.add('active');
    });
    document.getElementById('view-renovation').style.display = mode === 'renovation' ? 'grid' : 'none';
    document.getElementById('view-buy-new').style.display = mode === 'buyNew' ? 'grid' : 'none';
    document.getElementById('view-new-purchase').style.display = mode === 'newPurchase' ? 'grid' : 'none';
};

// =======================================================
// BASE PRODUCT INITIALIZATION (Renovation)
// =======================================================

function initBaseProducts() {
    const sel = document.getElementById("base-product");
    sel.innerHTML = `<option value="">-- Select Product --</option>`;
    const types = [...new Set(AppState.floor.map(r => r.producttype).filter(Boolean))];
    types.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t; opt.textContent = t;
        sel.appendChild(opt);
    });
}

function initNewPurchaseProducts() {
    const sel = document.getElementById("np-family");
    sel.innerHTML = `<option value="">-- Select Product Family --</option>`;
    const mappedProducts = AppState.reuseMap.map(r => r.existing).filter(Boolean);
    [...new Set(mappedProducts)].forEach(t => {
        const opt = document.createElement("option");
        opt.value = t; opt.textContent = t;
        sel.appendChild(opt);
    });
}

// =======================================================
// RENOVATION LISTENERS
// =======================================================

function attachListeners() {
    document.getElementById("base-product").addEventListener("change", e => {
        updateVariants(e.target.value, "base-variant");
        updatePedestals(e.target.value, "base-pedestal");
        renderStrategies();
        calculate();
    });
    document.getElementById("base-variant").addEventListener("change", () => { renderStrategies(); calculate(); });
    document.getElementById("base-pedestal").addEventListener("change", calculate);
    document.getElementById("new-product").addEventListener("change", e => {
        updateVariants(e.target.value, "new-variant");
        updatePedestals(e.target.value, "new-pedestal");
        calculate();
    });
    document.getElementById("new-variant").addEventListener("change", calculate);
    document.getElementById("new-pedestal").addEventListener("change", calculate);
    document.getElementById("np-family").addEventListener("change", e => renderNewPurchaseComparison(e.target.value));
    document.getElementById("np-include-pedestals").addEventListener("change", e => {
        document.querySelectorAll(".np-pedestal-wrapper").forEach(el => {
            el.style.display = e.target.checked ? "block" : "none";
        });
        calculateNewPurchase();
    });
}

// =======================================================
// BUY NEW PRODUCT INITIALIZATION
// =======================================================

function initBuyNewBaseProducts() {
    const types = [...new Set(AppState.floor.map(r => r.producttype).filter(Boolean))];
    ["bnp-base-product", "bnp-new-product"].forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = `<option value="">-- Select Product --</option>`;
        types.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t; opt.textContent = t;
            sel.appendChild(opt);
        });
    });
}

// =======================================================
// BUY NEW PRODUCT LISTENERS
// =======================================================

function attachBuyNewListeners() {

    document.getElementById("bnp-base-product").addEventListener("change", e => {
        updateVariants(e.target.value, "bnp-base-variant");
        updatePedestals(e.target.value, "bnp-base-pedestal");
        document.getElementById("bnp-base-scenario").innerHTML = "";
        document.getElementById("bnp-base-scenario").disabled = true;

        // Reset option 2 when option 1 changes
        document.getElementById("bnp-new-product").value = "";
        document.getElementById("bnp-new-variant").innerHTML = "";
        document.getElementById("bnp-new-variant").disabled = true;
        document.getElementById("bnp-new-scenario").innerHTML = "";
        document.getElementById("bnp-new-scenario").disabled = true;
        resetCompetitor();

        filterOption2Products();
        updateProductLink(e.target.value, "bnp-base-link");
        updateCompetitorButtonVisibility();
        calculateBuyNew();
    });

    document.getElementById("bnp-base-variant").addEventListener("change", e => {
        const prod = document.getElementById("bnp-base-product").value;
        updateBuyNewScenarios(prod, e.target.value, "bnp-base-scenario");

        document.getElementById("bnp-new-product").value = "";
        document.getElementById("bnp-new-variant").innerHTML = "";
        document.getElementById("bnp-new-variant").disabled = true;
        document.getElementById("bnp-new-scenario").innerHTML = "";
        document.getElementById("bnp-new-scenario").disabled = true;
        resetCompetitor();

        filterOption2Products();
        updateCompetitorButtonVisibility();
        calculateBuyNew();
    });

    document.getElementById("bnp-base-scenario").addEventListener("change", () => {
        filterOption2Products();
        if (document.getElementById("bnp-section-competitor").style.display !== "none") initCompetitorProducts();
        updateCompetitorButtonVisibility();
        calculateBuyNew();
    });

    document.getElementById("bnp-base-pedestal").addEventListener("change", calculateBuyNew);

    document.getElementById("bnp-new-product").addEventListener("change", e => {
        updateVariants(e.target.value, "bnp-new-variant");
        updatePedestals(e.target.value, "bnp-new-pedestal");
        document.getElementById("bnp-new-scenario").innerHTML = "";
        document.getElementById("bnp-new-scenario").disabled = true;

        if (document.getElementById("bnp-section-competitor").style.display !== "none") initCompetitorProducts();
        updateProductLink(e.target.value, "bnp-new-link");
        updateCompetitorButtonVisibility();
        calculateBuyNew();
    });

    document.getElementById("bnp-new-variant").addEventListener("change", e => {
        const prod = document.getElementById("bnp-new-product").value;
        updateBuyNewScenarios(prod, e.target.value, "bnp-new-scenario");
        calculateBuyNew();
    });

    document.getElementById("bnp-new-scenario").addEventListener("change", calculateBuyNew);
    document.getElementById("bnp-new-pedestal").addEventListener("change", calculateBuyNew);

    document.getElementById("bnp-show-area").addEventListener("change", e => {
        document.getElementById("bnp-area-container").style.display = e.target.checked ? "block" : "none";
        calculateBuyNew();
    });

    document.getElementById("bnp-project-area").addEventListener("input", calculateBuyNew);

    document.getElementById("bnp-include-pedestals").addEventListener("change", e => {
        const display = e.target.checked ? "block" : "none";
        document.querySelectorAll(".bnp-pedestal-group").forEach(el => el.style.display = display);
        if (e.target.checked) resetCompetitor();
        updateCompetitorButtonVisibility();
        calculateBuyNew();
    });

    document.getElementById("bnp-add-competitor-btn").addEventListener("click", () => {
        document.getElementById("bnp-section-competitor").style.display = "block";
        document.getElementById("bnp-add-competitor-wrapper").style.display = "none";
        initCompetitorProducts();
    });

    document.getElementById("bnp-remove-competitor-btn").addEventListener("click", () => {
        resetCompetitor();
        updateCompetitorButtonVisibility();
        calculateBuyNew();
    });

    document.getElementById("bnp-comp-product").addEventListener("change", e => {
        updateCompetitorVariants(e.target.value);
        document.getElementById("bnp-comp-scenario").innerHTML = "";
        document.getElementById("bnp-comp-scenario").disabled = true;
        calculateBuyNew();
    });

    document.getElementById("bnp-comp-variant").addEventListener("change", () => {
        updateCompetitorScenarios();
        calculateBuyNew();
    });

    document.getElementById("bnp-comp-scenario").addEventListener("change", calculateBuyNew);
}

function resetCompetitor() {
    document.getElementById("bnp-section-competitor").style.display = "none";
    document.getElementById("bnp-comp-product").innerHTML = "";
    document.getElementById("bnp-comp-variant").innerHTML = "";
    document.getElementById("bnp-comp-variant").disabled = true;
    document.getElementById("bnp-comp-scenario").innerHTML = "";
    document.getElementById("bnp-comp-scenario").disabled = true;
}

// =======================================================
// PRODUCT LINK HELPER
// =======================================================

function updateProductLink(productName, linkId) {
    const linkEl = document.getElementById(linkId);
    if (!linkEl) return;
    linkEl.style.display = "none";
    if (!productName) return;

    const normalize = s => s ? s.trim().toLowerCase() : "";
    const target = normalize(productName);
    const row = AppState.productLinks.find(r =>
        Object.values(r).some(v => normalize(v) === target)
    );
    if (row) {
        const url = Object.values(row).find(v => v && (v.includes("http://") || v.includes("https://")));
        if (url) { linkEl.href = url.trim(); linkEl.style.display = "inline-flex"; }
    }
}

// =======================================================
// COMPETITOR BUTTON VISIBILITY
// =======================================================

function updateCompetitorButtonVisibility() {
    const baseProd = document.getElementById("bnp-base-product").value;
    const baseScenario = document.getElementById("bnp-base-scenario").value;
    const newProd = document.getElementById("bnp-new-product").value;
    const btnWrapper = document.getElementById("bnp-add-competitor-wrapper");
    const compSection = document.getElementById("bnp-section-competitor");
    const includePedestals = document.getElementById("bnp-include-pedestals").checked;

    // Only show if both products AND a scenario are selected, and competitor panel is hidden, and no pedestals
    if (baseProd && baseScenario && newProd && compSection.style.display === "none" && !includePedestals) {
        btnWrapper.style.display = "block";
    } else {
        btnWrapper.style.display = "none";
    }
}

// =======================================================
// COMPETITOR PRODUCTS — filtered by matching scenario
// =======================================================

function initCompetitorProducts() {
    const baseProd = document.getElementById("bnp-base-product").value;
    const newProd = document.getElementById("bnp-new-product").value;
    const baseScenarioSelect = document.getElementById("bnp-base-scenario");
    const sel = document.getElementById("bnp-comp-product");
    const currentVal = sel.value;

    sel.innerHTML = `<option value="">-- Select Competitor --</option>`;
    if (!baseProd && !newProd) return;

    const normalize = str => str ? str.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    const findKey = (obj, key) => Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());

    const competitors = new Set();
    const sources = [baseProd, newProd].filter(Boolean);

    const matches = AppState.competitorMap.filter(r => {
        const typeKey = findKey(r, "producttype") || findKey(r, "lindnertype");
        return typeKey && r[typeKey] && sources.some(s => normalize(s) === normalize(r[typeKey]));
    });

    matches.forEach(r => {
        const compKey = findKey(r, "producttype_comparable") || findKey(r, "competitortype");
        if (compKey && r[compKey]) competitors.add(r[compKey]);
    });

    let compTypes = [...competitors].sort();

    // Filter by matching scenario category
    let targetCategory = "UNKNOWN";
    if (!baseScenarioSelect.disabled && baseScenarioSelect.value !== "") {
        targetCategory = getScenarioCategory(baseScenarioSelect.options[baseScenarioSelect.selectedIndex]?.text);
    }

    if (targetCategory !== "UNKNOWN" && targetCategory !== "OTHER") {
        compTypes = compTypes.filter(compName => {
            const compRows = AppState.competitorImpacts.filter(r => {
                const typeKey = findKey(r, "producttype_comparable");
                return typeKey && r[typeKey] && r[typeKey].trim().toLowerCase() === compName.trim().toLowerCase();
            });
            return compRows.some(row => {
                const s1 = getScenarioCategory(row["Scenario 1"]);
                const s2 = getScenarioCategory(row["Scenario 2"]);
                const s3 = getScenarioCategory(row["Scenario 3"]);
                return s1 === targetCategory || s2 === targetCategory || s3 === targetCategory;
            });
        });
    }

    if (compTypes.length === 0) {
        const opt = document.createElement("option");
        opt.textContent = "No comparable competitor data available";
        opt.value = "NO_MATCH";
        opt.disabled = true;
        sel.appendChild(opt);
    } else {
        compTypes.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t; opt.textContent = t;
            sel.appendChild(opt);
        });
    }

    if (currentVal && compTypes.includes(currentVal)) sel.value = currentVal;
}

// =======================================================
// COMPETITOR VARIANTS & SCENARIOS
// =======================================================

function updateCompetitorVariants(compType) {
    const sel = document.getElementById("bnp-comp-variant");
    sel.innerHTML = `<option value="">-- Select Variant --</option>`;
    sel.disabled = !compType;
    if (!compType || compType === "NO_MATCH") return;

    const findKey = (obj, key) => Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    const matches = AppState.competitorImpacts.filter(r => {
        const typeKey = findKey(r, "producttype_comparable");
        return typeKey && r[typeKey] && r[typeKey].toLowerCase() === compType.toLowerCase();
    });

    matches.forEach(r => {
        const varKey = findKey(r, "productvariant_comparable") || findKey(r, "prodzcrvariant_comparable");
        if (varKey && r[varKey]) {
            const opt = document.createElement("option");
            opt.value = r[varKey]; opt.textContent = r[varKey];
            sel.appendChild(opt);
        }
    });
}

function updateCompetitorScenarios() {
    const compProd = document.getElementById("bnp-comp-product").value;
    const compVar = document.getElementById("bnp-comp-variant").value;
    const sel = document.getElementById("bnp-comp-scenario");
    const baseScenarioSelect = document.getElementById("bnp-base-scenario");

    let targetCategory = "UNKNOWN";
    if (!baseScenarioSelect.disabled && baseScenarioSelect.value !== "") {
        targetCategory = getScenarioCategory(baseScenarioSelect.options[baseScenarioSelect.selectedIndex]?.text);
    }

    sel.innerHTML = `<option value="">-- Select Scenario --</option>`;
    sel.disabled = true;
    if (!compProd || !compVar) return;

    const findKey = (obj, key) => Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    const row = AppState.competitorImpacts.find(r => {
        const typeKey = findKey(r, "producttype_comparable");
        const varKey = findKey(r, "productvariant_comparable") || findKey(r, "prodzcrvariant_comparable");
        return typeKey && r[typeKey] && r[typeKey].toLowerCase() === compProd.toLowerCase() &&
               varKey && r[varKey] && r[varKey].toLowerCase() === compVar.toLowerCase();
    });

    if (row) {
        const scenarios = [
            { name: row["Scenario 1"], col: "(A1-C4)" },
            { name: row["Scenario 2"], col: "(A1-C4)/1" },
            { name: row["Scenario 3"], col: "(A1-C4)/2" }
        ];
        let added = false;
        scenarios.forEach(sc => {
            const scCategory = getScenarioCategory(sc.name);
            const isMatch = (targetCategory !== "UNKNOWN" && targetCategory !== "OTHER")
                            ? scCategory === targetCategory : true;
            if (sc.name && sc.name.trim() !== "" && isMatch) {
                const opt = document.createElement("option");
                opt.value = sc.col; opt.textContent = sc.name;
                sel.appendChild(opt);
                added = true;
            }
        });
        if (added) sel.disabled = false;
        else {
            const opt = document.createElement("option");
            opt.textContent = "No matching scenario"; opt.disabled = true;
            sel.appendChild(opt);
        }
    }
}

// =======================================================
// SCENARIO UTILS
// =======================================================

function updateBuyNewScenarios(product, variant, targetId) {
    const sel = document.getElementById(targetId);
    sel.innerHTML = `<option value="">-- Select Scenario --</option>`;
    sel.disabled = true;
    if (!product || !variant) return;

    const row = AppState.scenarioMap.find(r =>
        r.producttype.toLowerCase() === product.toLowerCase() &&
        r.productvariant.toLowerCase() === variant.toLowerCase()
    );
    if (!row) return;

    const scenarios = [
        { name: row["Scenario 1"], col: "(A1-C4)" },
        { name: row["Scenario 2"], col: "(A1-C4)/1" },
        { name: row["Scenario 3"], col: "(A1-C4)/2" }
    ];

    scenarios.forEach(sc => {
        if (sc.name && sc.name.trim() !== "") {
            const opt = document.createElement("option");
            opt.value = sc.col;
            opt.textContent = sc.name;
            sel.appendChild(opt);
        }
    });

    if (sel.options.length > 1) { sel.disabled = false; sel.selectedIndex = 0; }
}

function getScenarioCategory(text) {
    if (!text) return "UNKNOWN";
    const t = text.toLowerCase();
    if (t.includes("reuse") || t.includes("refurbish")) return "REUSE";
    if (t.includes("landfill")) return "LANDFILL";
    if (t.includes("incineration")) return "INCINERATION";
    if (t.includes("recycling") || t.includes("recycle")) return "RECYCLING";
    return "OTHER";
}

function getScenarioBadgeClass(category) {
    const map = { REUSE: 'badge-reuse', LANDFILL: 'badge-landfill', INCINERATION: 'badge-incineration', RECYCLING: 'badge-recycling' };
    return map[category] || '';
}

// =======================================================
// OPTION 2 FILTERING (scenario-matched products)
// =======================================================

function filterOption2Products() {
    const baseScenarioSelect = document.getElementById("bnp-base-scenario");
    const sel2 = document.getElementById("bnp-new-product");
    const currentVal = sel2.value;

    const allTypes = [...new Set(AppState.floor.map(r => r.producttype).filter(Boolean))];
    let filteredTypes = allTypes;

    if (!baseScenarioSelect.disabled && baseScenarioSelect.value !== "") {
        const selectedText = baseScenarioSelect.options[baseScenarioSelect.selectedIndex]?.text;
        const category = getScenarioCategory(selectedText);

        if (category !== "UNKNOWN" && category !== "OTHER") {
            filteredTypes = allTypes.filter(type => {
                const productRows = AppState.scenarioMap.filter(r => r.producttype.toLowerCase() === type.toLowerCase());
                return productRows.some(row => {
                    return getScenarioCategory(row["Scenario 1"]) === category ||
                           getScenarioCategory(row["Scenario 2"]) === category ||
                           getScenarioCategory(row["Scenario 3"]) === category;
                });
            });
        }
    }

    sel2.innerHTML = `<option value="">-- Select Product --</option>`;
    if (filteredTypes.length === 0) {
        const opt = document.createElement("option");
        opt.textContent = "No products match Option 1 scenario";
        opt.disabled = true;
        sel2.appendChild(opt);
    } else {
        filteredTypes.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t; opt.textContent = t;
            sel2.appendChild(opt);
        });
    }

    if (currentVal && filteredTypes.includes(currentVal)) {
        sel2.value = currentVal;
    } else {
        sel2.value = "";
        ["bnp-new-variant", "bnp-new-scenario", "bnp-new-pedestal"].forEach(id => {
            document.getElementById(id).innerHTML = "";
            document.getElementById(id).disabled = true;
        });
    }
}

// =======================================================
// BUY NEW CALCULATION
// =======================================================

function calculateBuyNew() {
    const includePedestals = document.getElementById("bnp-include-pedestals").checked;

    const baseProd = document.getElementById("bnp-base-product").value;
    const baseVar = document.getElementById("bnp-base-variant").value;
    const baseScenarioSelect = document.getElementById("bnp-base-scenario");
    const baseScenario = baseScenarioSelect.value;
    const basePed = document.getElementById("bnp-base-pedestal").value;

    const newProd = document.getElementById("bnp-new-product").value;
    const newVar = document.getElementById("bnp-new-variant").value;
    const newScenarioSelect = document.getElementById("bnp-new-scenario");
    const newScenario = newScenarioSelect.value;
    const newPed = document.getElementById("bnp-new-pedestal").value;

    const compProd = document.getElementById("bnp-comp-product").value;
    const compVar = document.getElementById("bnp-comp-variant").value;
    const compScenario = document.getElementById("bnp-comp-scenario").value;
    const isCompActive = document.getElementById("bnp-section-competitor").style.display !== "none";

    const warningContainer = document.getElementById("bnp-warning-box");
    const warningBox = warningContainer.querySelector('.warning-box') || warningContainer;
    const resultsCard = document.getElementById("bnp-results");
    const totalRow = document.getElementById("bnp-total-row");

    // Validate scenario categories match
    if (baseProd && newProd && baseScenario && newScenario) {
        const cat1 = getScenarioCategory(baseScenarioSelect.options[baseScenarioSelect.selectedIndex]?.text);
        const cat2 = getScenarioCategory(newScenarioSelect.options[newScenarioSelect.selectedIndex]?.text);

        if (cat1 !== cat2) {
            warningContainer.style.display = "block";
            warningBox.innerHTML = `<strong>⚠ Comparison Not Valid:</strong> Option 1 uses <em>${cat1}</em> scenario but Option 2 uses <em>${cat2}</em>. Select matching scenarios for a fair comparison.`;
            resultsCard.style.display = "none";
            return;
        } else {
            warningContainer.style.display = "none";
        }
    } else {
        warningContainer.style.display = "none";
        if (!baseScenario || !newScenario) {
            resultsCard.style.display = "none";
        }
    }

    // Calculate impacts
    let baseline = 0;
    if (baseProd && baseScenario) {
        const pedImpact = includePedestals ? getPedestalImpact(basePed) : 0;
        baseline = getFloorImpact(baseProd, baseVar, baseScenario) + pedImpact;
    }

    let newSystem = 0;
    if (newProd && newScenario) {
        const pedImpact = includePedestals ? getPedestalImpact(newPed) : 0;
        newSystem = getFloorImpact(newProd, newVar, newScenario) + pedImpact;
    }

    let compSystem = 0;
    if (isCompActive && compProd && compVar && compScenario) {
        const findKey = (obj, key) => Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
        const row = AppState.competitorImpacts.find(r => {
            const typeKey = findKey(r, "producttype_comparable");
            const varKey = findKey(r, "productvariant_comparable") || findKey(r, "prodzcrvariant_comparable");
            return typeKey && r[typeKey] && r[typeKey].toLowerCase() === compProd.toLowerCase() &&
                   varKey && r[varKey] && r[varKey].toLowerCase() === compVar.toLowerCase();
        });
        if (row && row[compScenario]) compSystem = parseFloat(row[compScenario]);
    }

    document.getElementById("bnp-res-baseline").textContent = baseline.toFixed(2);
    document.getElementById("bnp-res-new").textContent = newSystem.toFixed(2);

    if (baseline > 0 && newSystem > 0) {
        resultsCard.style.display = "block";
        updateRingUI(baseline, newSystem, "ring-val-bnp", "ring-lbl-bnp", "ring-circle-bnp");
        updateBuyNewChart(baseline, newSystem, baseProd, newProd);

        // Build 3D showcase — winner = lowest GWP, include product URLs
        const getLink = name => {
            const normalize = s => s ? s.trim().toLowerCase() : "";
            const row = AppState.productLinks.find(r => normalize(r["Product"] || r["product"]) === normalize(name));
            return row ? (row["Link"] || row["link"] || "").trim() : "";
        };
        const showcaseProducts = [
            { name: baseProd || 'Option 1', gwp: baseline, isWinner: false, isCompetitor: false, url: getLink(baseProd) },
            { name: newProd || 'Option 2', gwp: newSystem, isWinner: false, isCompetitor: false, url: getLink(newProd) }
        ];
        if (isCompActive && compSystem > 0) {
            showcaseProducts.push({ name: compProd || 'Competitor', gwp: compSystem, isWinner: false, isCompetitor: true, url: "" });
        }
        const minGwp = Math.min(...showcaseProducts.map(p => p.gwp));
        showcaseProducts.forEach(p => { p.isWinner = p.gwp === minGwp; });
        buildShowcase(showcaseProducts);

        // Project area calculation
        const showArea = document.getElementById("bnp-show-area").checked;
        const area = parseFloat(document.getElementById("bnp-project-area").value);
        if (showArea && area && area > 0) {
            totalRow.style.display = "block";
            const totalBase = baseline * area;
            const totalNew = newSystem * area;
            const diff = totalBase - totalNew;
            document.getElementById("bnp-total-baseline").textContent = totalBase.toFixed(0);
            document.getElementById("bnp-total-new").textContent = totalNew.toFixed(0);
            const savingsEl = document.getElementById("bnp-total-savings");
            const labelEl = document.getElementById("bnp-total-label");
            const bannerEl = document.getElementById("bnp-savings-banner");
            labelEl.textContent = diff >= 0 ? "TOTAL SAVINGS" : "ADDITIONAL BURDEN";
            savingsEl.textContent = Math.abs(diff).toFixed(0);
            if (diff >= 0) {
                savingsEl.style.color = "var(--success)";
                if (bannerEl) { bannerEl.style.background = "linear-gradient(135deg,rgba(0,217,139,0.15),rgba(0,184,217,0.1))"; bannerEl.style.borderColor = "rgba(0,217,139,0.4)"; }
            } else {
                savingsEl.style.color = "var(--danger)";
                if (bannerEl) { bannerEl.style.background = "rgba(240,84,84,0.08)"; bannerEl.style.borderColor = "rgba(240,84,84,0.35)"; }
            }
        } else {
            totalRow.style.display = "none";
        }
    } else {
        resultsCard.style.display = "none";
        destroyShowcase();
        const sc = document.getElementById('bnp-product-showcase');
        if (sc) { sc.innerHTML = ''; sc.classList.remove('active'); }
        const ss = document.getElementById('bnp-showcase-section');
        if (ss) ss.style.display = 'none';
    }

    const compResultsCard = document.getElementById("bnp-competitor-results");
    if (isCompActive && baseline > 0 && newSystem > 0 && compSystem > 0) {
        compResultsCard.style.display = "block";
        updateThreeWayChart(baseline, newSystem, compSystem, baseProd, newProd, compProd);
    } else {
        compResultsCard.style.display = "none";
    }
}

// =======================================================
// VARIANTS + PEDESTALS
// =======================================================

function updateVariants(productType, targetId) {
    const sel = document.getElementById(targetId);
    sel.innerHTML = `<option value="">-- Select Variant --</option>`;
    sel.disabled = !productType;
    if (!productType) return;

    const matches = AppState.floor.filter(r => r.producttype.toLowerCase() === productType.toLowerCase());
    matches.forEach(r => {
        if (r.productvariant) {
            const opt = document.createElement("option");
            opt.value = r.productvariant; opt.textContent = r.productvariant;
            sel.appendChild(opt);
        }
    });
}

function updatePedestals(productType, targetId) {
    const sel = document.getElementById(targetId);
    sel.innerHTML = `<option value="">-- Select Pedestal --</option>`;
    sel.disabled = !productType;
    if (!productType) return;

    const normalize = str => str ? str.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    const mapRow = AppState.pedestalMap.find(r => normalize(r.producttype) === normalize(productType));
    if (!mapRow) return;

    const allowedType = mapRow.Productfloor.toLowerCase();
    AppState.pedestal.filter(p => p.Productfloor && p.Productfloor.toLowerCase().includes(allowedType)).forEach(p => {
        const opt = document.createElement("option");
        opt.value = JSON.stringify({ type: p["Pedestal type"], variant: p["Variant"] });
        opt.textContent = `${p["Pedestal type"]} - ${p["Variant"]}`;
        sel.appendChild(opt);
    });
}

// =======================================================
// RENOVATION: STRATEGY RENDERING
// =======================================================

function renderStrategies() {
    const container = document.getElementById("strategy-container");
    const product = document.getElementById("base-product").value;
    const variant = document.getElementById("base-variant").value;
    container.innerHTML = "";

    if (!product || !variant) {
        container.innerHTML = `<p class="placeholder-text">Select a product and variant to view available strategies.</p>`;
        return;
    }

    const row = AppState.scenarioMap.find(r =>
        r.producttype.toLowerCase() === product.toLowerCase() &&
        r.productvariant.toLowerCase() === variant.toLowerCase()
    );

    if (!row) {
        container.innerHTML = `<p class="placeholder-text">No scenarios found for this combination.</p>`;
        return;
    }

    const scenarios = [
        { name: row["Scenario 1"], col: "(A1-C4)" },
        { name: row["Scenario 2"], col: "(A1-C4)/1" },
        { name: row["Scenario 3"], col: "(A1-C4)/2" }
    ];

    const icons = { REUSE: '♻️', LANDFILL: '🗑️', INCINERATION: '🔥', RECYCLING: '🔄', OTHER: '⚙️' };

    scenarios.forEach(sc => {
        if (sc.name && sc.name.trim() !== "") {
            const cat = getScenarioCategory(sc.name);
            createStrategyButton(container, sc.name, sc.col, icons[cat] || '⚙️', cat);
        }
    });
}

function createStrategyButton(container, name, columnKey, icon = '⚙️', category = '') {
    const btn = document.createElement("button");
    btn.className = "strategy-btn";
    const badgeClass = getScenarioBadgeClass(category);
    const badge = badgeClass ? `<span class="scenario-badge ${badgeClass}">${category}</span>` : '';
    btn.innerHTML = `<span class="icon">${icon}</span><div style="flex:1"><span class="text">${name}</span></div>${badge}`;
    btn.onclick = () => selectStrategy(btn, name, columnKey);
    container.appendChild(btn);
}

function selectStrategy(btn, scenarioName, columnKey) {
    AppState.selectedScenarioColumn = columnKey;
    document.querySelectorAll(".strategy-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const lower = scenarioName.toLowerCase();
    const baseProd = document.getElementById("base-product").value;
    const newSel = document.getElementById("new-product");
    const reuseInfo = document.getElementById("reuse-info");
    const reuseMsg = document.getElementById("reuse-message");

    if (lower.includes("reuse") || lower.includes("refurbish")) {
        const mapRow = AppState.reuseMap.find(r => r.existing.toLowerCase() === baseProd.toLowerCase());
        if (mapRow) {
            newSel.innerHTML = `<option value="${mapRow.refurbished}">${mapRow.refurbished}</option>`;
            newSel.value = mapRow.refurbished;
            newSel.disabled = true;
            updateVariants(mapRow.refurbished, "new-variant");
            updatePedestals(mapRow.refurbished, "new-pedestal");
            reuseInfo.style.display = "flex";
            reuseMsg.textContent = `Auto-mapped: ${baseProd} ➝ ${mapRow.refurbished}`;
        } else {
            reuseInfo.style.display = "flex";
            reuseMsg.textContent = "No automatic mapping available. Select new product manually.";
            initNewProductList();
        }
    } else {
        reuseInfo.style.display = "none";
        initNewProductList();
    }
    calculate();
}

function initNewProductList() {
    const sel = document.getElementById("new-product");
    sel.disabled = false;
    sel.innerHTML = `<option value="">-- Select Product --</option>`;
    const types = [...new Set(AppState.floor.map(r => r.producttype).filter(Boolean))];
    types.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t; opt.textContent = t;
        sel.appendChild(opt);
    });
}

// =======================================================
// NEW PURCHASE MODE
// =======================================================

function renderNewPurchaseComparison(family) {
    const container = document.getElementById("np-comparison-container");
    const banner = document.getElementById("np-result-banner");
    if (!family) { container.style.display = "none"; banner.style.display = "none"; return; }

    const mapRow = AppState.reuseMap.find(r => r.existing.toLowerCase() === family.toLowerCase());
    if (!mapRow) { alert("No refurbished mapping found for this product."); return; }

    container.style.display = "grid";
    banner.style.display = "block";
    renderProductCard("np-card-new", mapRow.existing, "new");
    renderProductCard("np-card-refurb", mapRow.refurbished, "refurb");
    calculateNewPurchase();
}

function renderProductCard(containerId, productName, type) {
    const container = document.getElementById(containerId);
    const showPedestals = document.getElementById("np-include-pedestals").checked;

    const variants = AppState.floor
        .filter(r => r.producttype.toLowerCase() === productName.toLowerCase())
        .map(r => r.productvariant).filter(Boolean);

    container.innerHTML = `
        <div class="input-group">
            <label>Product</label>
            <input type="text" value="${productName}" disabled>
        </div>
        <div class="input-group">
            <label>Variant</label>
            <select class="np-variant-sel" data-type="${type}" onchange="calculateNewPurchase()">
                ${variants.map(v => `<option value="${v}">${v}</option>`).join('')}
            </select>
        </div>
        <div class="input-group np-pedestal-wrapper" style="display:${showPedestals ? 'block' : 'none'};">
            <label>Pedestal</label>
            <select class="np-pedestal-sel" data-type="${type}" onchange="calculateNewPurchase()"></select>
        </div>
        <div class="kpi-box" style="margin-top:20px;">
            <span class="label">Total Impact</span>
            <span class="value" id="np-res-${type}">—</span>
            <span class="unit">kg CO₂e / m²</span>
        </div>
    `;

    const pedSel = container.querySelector('.np-pedestal-sel');
    pedSel.innerHTML = `<option value="">-- Select --</option>`;
    const mapRow = AppState.pedestalMap.find(r => r.producttype.toLowerCase() === productName.toLowerCase());
    if (mapRow) {
        const allowedType = mapRow.Productfloor.toLowerCase();
        AppState.pedestal.filter(p => p.Productfloor && p.Productfloor.toLowerCase().includes(allowedType)).forEach(p => {
            const opt = document.createElement("option");
            opt.value = JSON.stringify({ type: p["Pedestal type"], variant: p["Variant"] });
            opt.textContent = `${p["Pedestal type"]} - ${p["Variant"]}`;
            pedSel.appendChild(opt);
        });
    }
}

function calculateNewPurchase() {
    const newProdName = document.getElementById("np-family").value;
    const mapRow = AppState.reuseMap.find(r => r.existing.toLowerCase() === newProdName.toLowerCase());
    if (!mapRow) return;
    const refurbProdName = mapRow.refurbished;
    const includePedestals = document.getElementById("np-include-pedestals").checked;

    const newVarEl = document.querySelector('.np-variant-sel[data-type="new"]');
    const newPedEl = document.querySelector('.np-pedestal-sel[data-type="new"]');
    const refurbVarEl = document.querySelector('.np-variant-sel[data-type="refurb"]');
    const refurbPedEl = document.querySelector('.np-pedestal-sel[data-type="refurb"]');

    if (!newVarEl || !refurbVarEl) return;

    const banner = document.getElementById("np-result-banner");
    const bannerText = document.getElementById("np-result-text");

    if (includePedestals && (!newPedEl?.value || !refurbPedEl?.value)) {
        document.getElementById("np-res-new").textContent = "—";
        document.getElementById("np-res-refurb").textContent = "—";
        bannerText.innerHTML = "Please select a pedestal for <strong>both</strong> options to calculate results.";
        banner.style.borderColor = "var(--warning)";
        banner.style.background = "rgba(245,158,11,0.1)";
        return;
    }

    const pedImpactNew = includePedestals ? getPedestalImpact(newPedEl.value) : 0;
    const pedImpactRefurb = includePedestals ? getPedestalImpact(refurbPedEl.value) : 0;

    const colNew = getConventionalScenarioColumn(newProdName, newVarEl.value);
    const colRefurb = getConventionalScenarioColumn(refurbProdName, refurbVarEl.value);

    const impactNew = getFloorImpact(newProdName, newVarEl.value, colNew) + pedImpactNew;
    const impactRefurb = getFloorImpact(refurbProdName, refurbVarEl.value, colRefurb) + pedImpactRefurb;

    document.getElementById("np-res-new").textContent = impactNew.toFixed(2);
    document.getElementById("np-res-refurb").textContent = impactRefurb.toFixed(2);

    if (impactNew > 0 && impactRefurb > 0) {
        const diff = impactNew - impactRefurb;
        const pct = Math.abs((diff / impactNew) * 100).toFixed(1);
        if (diff > 0) {
            bannerText.innerHTML = `🌿 Choosing <strong>${refurbProdName}</strong> reduces carbon impact by <strong>${pct}%</strong> vs ${newProdName}.`;
            banner.style.borderColor = "var(--success)";
            banner.style.background = "rgba(0,217,139,0.1)";
        } else {
            bannerText.innerHTML = `⚠ Refurbished option increases carbon impact by <strong>${pct}%</strong>.`;
            banner.style.borderColor = "var(--danger)";
            banner.style.background = "rgba(240,84,84,0.1)";
        }
    }
}

function getConventionalScenarioColumn(productType, variant) {
    const row = AppState.scenarioMap.find(r =>
        r.producttype.toLowerCase() === productType.toLowerCase() &&
        r.productvariant.toLowerCase() === variant.toLowerCase()
    );
    if (!row) return "(A1-C4)";
    const scenarios = [
        { text: (row["Scenario 1"] || "").toLowerCase(), col: "(A1-C4)" },
        { text: (row["Scenario 2"] || "").toLowerCase(), col: "(A1-C4)/1" },
        { text: (row["Scenario 3"] || "").toLowerCase(), col: "(A1-C4)/2" }
    ];
    const landfill = scenarios.find(s => s.text.includes("landfill"));
    if (landfill) return landfill.col;
    const incineration = scenarios.find(s => s.text.includes("incineration"));
    if (incineration) return incineration.col;
    return "(A1-C4)";
}

// =======================================================
// CALCULATION ENGINE
// =======================================================

function getFloorImpact(productType, variant, column) {
    const row = AppState.floor.find(r =>
        r.producttype.toLowerCase() === productType.toLowerCase() &&
        r.productvariant.toLowerCase() === variant.toLowerCase()
    );
    return row && row[column] ? parseFloat(row[column]) : 0;
}

function getPedestalImpact(value) {
    if (!value) return 0;
    try {
        const obj = JSON.parse(value);
        const row = AppState.pedestal.find(p =>
            p["Pedestal type"] === obj.type && p["Variant"] === obj.variant
        );
        return row ? parseFloat(row["A1-C4"]) : 0;
    } catch { return 0; }
}

function calculate() {
    const baseProd = document.getElementById("base-product").value;
    const baseVar = document.getElementById("base-variant").value;
    const basePed = document.getElementById("base-pedestal").value;
    if (!baseProd || !AppState.selectedScenarioColumn) return;

    const baseline = getFloorImpact(baseProd, baseVar, AppState.selectedScenarioColumn) + getPedestalImpact(basePed);
    const newProd = document.getElementById("new-product").value;
    const newVar = document.getElementById("new-variant").value;
    const newPed = document.getElementById("new-pedestal").value;
    const resultsCard = document.getElementById("renovation-results");

    const newSystem = newProd ? getFloorImpact(newProd, newVar, "(A1-C4)") + getPedestalImpact(newPed) : 0;

    document.getElementById("res-baseline").textContent = baseline.toFixed(2);
    document.getElementById("res-new").textContent = newSystem.toFixed(2);

    if (baseline > 0 && newSystem > 0) {
        resultsCard.style.display = "block";
        updateRingUI(baseline, newSystem, "ring-val-renovation", "ring-lbl-renovation", "ring-circle-renovation");
        updateChart(baseline, newSystem);
    } else {
        resultsCard.style.display = "none";
    }
}

// =======================================================
// RING UI
// =======================================================

function updateRingUI(baseline, newSystem, valId, lblId, circleId) {
    const valEl = document.getElementById(valId);
    const lblEl = document.getElementById(lblId);
    const circleEl = document.getElementById(circleId);
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    circleEl.style.strokeDasharray = `${circumference} ${circumference}`;
    circleEl.style.strokeDashoffset = circumference;

    if (baseline > 0 && newSystem > 0) {
        const diff = baseline - newSystem;
        const rawPct = (diff / baseline) * 100;
        const absPct = Math.abs(rawPct);

        if (diff >= 0) {
            lblEl.textContent = "Savings";
            valEl.style.color = "var(--success)";
            circleEl.style.stroke = "var(--success)";
            const offset = circumference - (Math.min(absPct, 100) / 100) * circumference;
            circleEl.style.strokeDashoffset = offset;
            valEl.textContent = absPct > 100 ? `${(absPct / 100).toFixed(1)}x` : `${absPct.toFixed(0)}%`;
            if (absPct > 100) lblEl.textContent = "Better";
        } else {
            valEl.style.color = "var(--danger)";
            circleEl.style.stroke = "var(--danger)";
            if (absPct >= 100) {
                valEl.textContent = `${(newSystem / baseline).toFixed(1)}x`;
                lblEl.textContent = "Impact";
                circleEl.style.strokeDashoffset = 0;
            } else {
                valEl.textContent = `${absPct.toFixed(0)}%`;
                lblEl.textContent = "Increase";
                circleEl.style.strokeDashoffset = circumference - (absPct / 100) * circumference;
            }
        }
    } else {
        valEl.textContent = "0%"; lblEl.textContent = "Savings";
        circleEl.style.strokeDashoffset = circumference;
    }
}

// =======================================================
// 3D PRODUCT SHOWCASE — results section, Buy New tab
// Renders a Three.js floating panel per product.
// Falls back to a branded canvas if no image found.
// =======================================================

const _3dScenes = {};

function destroyShowcase() {
    Object.values(_3dScenes).forEach(s => {
        cancelAnimationFrame(s.animId);
        try { s.renderer.dispose(); } catch(e) {}
    });
    Object.keys(_3dScenes).forEach(k => delete _3dScenes[k]);
}

function buildShowcase(products) {
    // Only show OUR Lindner products (not competitor) in 3D section
    const lindnerProducts = (products || []).filter(p => !p.isCompetitor);

    const container = document.getElementById('bnp-product-showcase');
    const section = document.getElementById('bnp-showcase-section');
    if (!container) return;
    destroyShowcase();
    container.innerHTML = '';

    if (lindnerProducts.length === 0) {
        container.classList.remove('active');
        if (section) section.style.display = 'none';
        return;
    }

    container.classList.add('active');
    if (section) section.style.display = 'block';

    lindnerProducts.forEach((prod, idx) => {
        if (idx > 0) {
            const vs = document.createElement('div');
            vs.className = 'showcase-vs';
            vs.innerHTML = `<div class="showcase-vs-line"></div>VS<div class="showcase-vs-line"></div>`;
            container.appendChild(vs);
        }

        const card = document.createElement('div');
        card.className = 'showcase-card';

        // Canvas wrapper — position relative so link overlay can sit on top
        const wrap = document.createElement('div');
        wrap.className = 'showcase-canvas-wrap';
        wrap.id = `showcase-wrap-${idx}`;
        wrap.style.position = 'relative';
        wrap.title = 'Click to view in fullscreen 3D';
        wrap.style.cursor = 'pointer';

        // Click → open fullscreen modal
        wrap.addEventListener('click', e => {
            // Don't trigger if clicking the product link
            if (e.target.closest('.showcase-product-link')) return;
            openModal3D(prod);
        });

        // Product link overlay on the 3D panel
        if (prod.url) {
            const linkOverlay = document.createElement('a');
            linkOverlay.className = 'showcase-product-link visible';
            linkOverlay.href = prod.url;
            linkOverlay.target = '_blank';
            linkOverlay.innerHTML = '🔗 View Product';
            wrap.appendChild(linkOverlay);
        }

        card.appendChild(wrap);

        const meta = document.createElement('div');
        meta.className = 'showcase-meta';

        const badge = document.createElement('div');
        badge.className = 'showcase-winner-badge' + (prod.isWinner ? ' visible' : '');
        if (prod.isCompetitor) {
            badge.textContent = '⚡ COMPETITOR';
            badge.style.background = 'linear-gradient(135deg,#f05454,#c0392b)';
            badge.style.color = '#fff';
            if (prod.isWinner) badge.classList.add('visible');
        } else {
            badge.textContent = '✦ LOWEST IMPACT';
        }
        meta.appendChild(badge);

        const nameEl = document.createElement('div');
        nameEl.className = 'showcase-name';
        nameEl.textContent = prod.name;
        meta.appendChild(nameEl);

        const gwpEl = document.createElement('div');
        gwpEl.className = 'showcase-gwp';
        gwpEl.style.color = prod.isWinner ? 'var(--success)' : 'white';
        gwpEl.textContent = prod.gwp.toFixed(2);
        meta.appendChild(gwpEl);

        const unitEl = document.createElement('span');
        unitEl.className = 'showcase-unit';
        unitEl.textContent = 'kg CO₂e / m²';
        meta.appendChild(unitEl);

        card.appendChild(meta);
        container.appendChild(card);

        requestAnimationFrame(() => {
            const mountEl = document.getElementById(`showcase-wrap-${idx}`);
            if (mountEl) initShowcaseScene(mountEl, prod, idx);
        });
    });
}

function initShowcaseScene(mount, prod, idx) {
    const W = mount.clientWidth || 240;
    const H = mount.clientHeight || 150;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0d1829, 1);
    mount.appendChild(renderer.domElement);

    const scene3 = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
    camera.position.set(0, 0, 3.4);

    scene3.add(new THREE.AmbientLight(0x3b7ff5, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(3, 3, 4);
    scene3.add(dir);
    const rimColor = prod.isCompetitor ? 0xf05454 : prod.isWinner ? 0x00d98b : 0x3b7ff5;
    const rim = new THREE.DirectionalLight(rimColor, 0.5);
    rim.position.set(-3, -2, -2);
    scene3.add(rim);

    const geo = new THREE.BoxGeometry(2.6, 1.65, 0.09);
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x162236, roughness: 0.8, metalness: 0.3 });

    const glowGeo = new THREE.PlaneGeometry(3.0, 2.05);
    const glowMat = new THREE.MeshBasicMaterial({ color: rimColor, transparent: true, opacity: 0.06, side: THREE.DoubleSide });
    const glowPlane = new THREE.Mesh(glowGeo, glowMat);
    glowPlane.position.z = -0.18;
    scene3.add(glowPlane);

    const shadowGeo = new THREE.PlaneGeometry(2.4, 0.28);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.y = -1.05;
    shadowMesh.rotation.x = -Math.PI / 2;
    scene3.add(shadowMesh);

    let panel = null;

    function buildPanel(frontMat) {
        const mats = [darkMat, darkMat, darkMat, darkMat, frontMat, darkMat];
        panel = new THREE.Mesh(geo, mats);
        scene3.add(panel);
    }

    function loadFallback() {
        const cv = document.createElement('canvas');
        cv.width = 512; cv.height = 320;
        const ctx2d = cv.getContext('2d');
        const grad = ctx2d.createLinearGradient(0, 0, 512, 320);
        grad.addColorStop(0, prod.isCompetitor ? '#2a0a0a' : prod.isWinner ? '#0a2a1a' : '#0a1a2a');
        grad.addColorStop(1, '#0d1829');
        ctx2d.fillStyle = grad;
        ctx2d.fillRect(0, 0, 512, 320);
        ctx2d.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx2d.lineWidth = 1;
        for (let x = 0; x < 512; x += 40) { ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, 320); ctx2d.stroke(); }
        for (let y = 0; y < 320; y += 40) { ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(512, y); ctx2d.stroke(); }
        ctx2d.font = 'bold 52px monospace';
        ctx2d.fillStyle = 'rgba(255,255,255,0.35)';
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText(prod.name, 256, 145);
        ctx2d.font = '500 26px monospace';
        ctx2d.fillStyle = prod.isWinner ? 'rgba(0,217,139,0.6)' : 'rgba(59,127,245,0.5)';
        ctx2d.fillText(prod.gwp.toFixed(2) + ' kg CO\u2082e/m\u00B2', 256, 210);
        buildPanel(new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), roughness: 0.45 }));
    }

    const imgPath = getProductImage(prod.name);
    if (imgPath) {
        new THREE.TextureLoader().load(imgPath,
            (tex) => { tex.encoding = THREE.sRGBEncoding; buildPanel(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.05 })); },
            undefined,
            () => loadFallback()
        );
    } else {
        loadFallback();
    }

    // Mouse tilt
    let mouseX = 0, mouseY = 0, isHovered = false;
    mount.addEventListener('mousemove', e => {
        const rect = mount.getBoundingClientRect();
        mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        isHovered = true;
    });
    mount.addEventListener('mouseleave', () => { isHovered = false; mouseX = 0; mouseY = 0; });

    let t = idx * 1.2;
    let targetRotX = 0, targetRotY = 0;

    function animate() {
        const id = requestAnimationFrame(animate);
        _3dScenes[`scene_${idx}`] = { renderer, animId: id };
        t += 0.012;
        if (panel) {
            if (isHovered) {
                targetRotY = mouseX * 0.55;
                targetRotX = -mouseY * 0.35;
            } else {
                targetRotY = Math.sin(t * 0.55) * 0.38;
                targetRotX = Math.sin(t * 0.38) * 0.1;
            }
            panel.rotation.y += (targetRotY - panel.rotation.y) * 0.08;
            panel.rotation.x += (targetRotX - panel.rotation.x) * 0.08;
            panel.position.y = Math.sin(t * 0.7) * 0.055;
        }
        shadowMesh.scale.x = 0.9 + Math.sin(t * 0.7) * 0.08;
        shadowMesh.material.opacity = 0.3 + Math.sin(t * 0.7) * 0.1;
        renderer.render(scene3, camera);
    }

    const animId = requestAnimationFrame(animate);
    _3dScenes[`scene_${idx}`] = { renderer, animId };
}

// =======================================================
// CHARTS
// =======================================================

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: '#1e293b',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleColor: '#94a3b8',
            bodyColor: '#f8fafc',
            bodyFont: { family: "'DM Mono', monospace", size: 13 },
            padding: 12,
            callbacks: {
                label: ctx => ` ${ctx.parsed.y.toFixed(2)} kg CO₂e/m²`
            }
        }
    },
    scales: {
        y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#6b82a0', font: { family: "'DM Mono', monospace", size: 11 } },
            border: { display: false }
        },
        x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { family: "'DM Sans', sans-serif", size: 12 } },
            border: { display: false }
        }
    }
};

function updateChart(baseline, newSystem) {
    const ctx = document.getElementById("impactChart").getContext("2d");
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["Baseline", "New System"],
            datasets: [{ data: [baseline, newSystem], backgroundColor: ["rgba(107,130,160,0.5)", "rgba(0,217,139,0.75)"], borderRadius: 8, borderSkipped: false }]
        },
        options: CHART_DEFAULTS
    });
}

function updateBuyNewChart(baseline, newSystem, label1, label2) {
    const ctx = document.getElementById("bnp-impactChart").getContext("2d");
    if (bnpChartInstance) bnpChartInstance.destroy();
    bnpChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: [label1 || "Option 1", label2 || "Option 2"],
            datasets: [{ data: [baseline, newSystem], backgroundColor: ["rgba(107,130,160,0.5)", "rgba(0,217,139,0.75)"], borderRadius: 8, borderSkipped: false }]
        },
        options: CHART_DEFAULTS
    });
}

function updateThreeWayChart(opt1, opt2, opt3, label1, label2, label3) {
    const ctx = document.getElementById("bnp-competitorChart").getContext("2d");
    if (bnpCompetitorChartInstance) bnpCompetitorChartInstance.destroy();
    bnpCompetitorChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: [label1 || "Option 1", label2 || "Option 2", label3 || "Competitor"],
            datasets: [{
                data: [opt1, opt2, opt3],
                backgroundColor: ["rgba(107,130,160,0.5)", "rgba(0,217,139,0.75)", "rgba(240,84,84,0.7)"],
                borderRadius: 8, borderSkipped: false
            }]
        },
        options: CHART_DEFAULTS
    });
}

// =======================================================
// PDF EXPORT
// =======================================================

window.exportToPDF = async function() {
    // Logo embedded directly — no fetch needed, works offline and on file://
    const _LOGO_B64 = 'data:image/png;base64,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';
    const btn = document.getElementById('pdf-btn');
    if (!btn) return;
    btn.classList.add('loading');
    btn.textContent = '⏳ Generating…';

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();   // 210mm
        const pageH = pdf.internal.pageSize.getHeight();  // 297mm
        const M = 14; // margin
        const col = (pageW - M * 2);

        // ── Helpers ──────────────────────────────────────────
        const bg     = (r,g,b) => { pdf.setFillColor(r,g,b); };
        const tc     = (r,g,b) => { pdf.setTextColor(r,g,b); };
        const font   = (style, size) => { pdf.setFont('helvetica', style); pdf.setFontSize(size); };
        const fillPage = () => { bg(8,15,28); pdf.rect(0,0,pageW,pageH,'F'); };
        const blueBar  = (y=0,h=1.5) => { bg(59,127,245); pdf.rect(0,y,pageW,h,'F'); };
        const sectionTitle = (text, y) => {
            bg(17,29,48); pdf.rect(M, y, col, 8, 'F');
            bg(59,127,245); pdf.rect(M, y, 2, 8, 'F');
            tc(238,242,248); font('bold', 9);
            pdf.text(text.toUpperCase(), M+6, y+5.5);
            return y + 12;
        };
        const hline = (y) => {
            pdf.setDrawColor(40,60,90); pdf.setLineWidth(0.3);
            pdf.line(M, y, pageW-M, y);
            return y + 4;
        };

        // ── Collect live data ─────────────────────────────────
        const opt1Prod     = document.getElementById('bnp-base-product')?.value || '—';
        const opt1Var      = document.getElementById('bnp-base-variant')?.value || '—';
        const opt1ScenEl   = document.getElementById('bnp-base-scenario');
        const opt1Scen     = opt1ScenEl && !opt1ScenEl.disabled ? (opt1ScenEl.options[opt1ScenEl.selectedIndex]?.text||'—') : '—';
        const gwp1Txt      = document.getElementById('bnp-res-baseline')?.textContent || '—';
        const gwp1          = parseFloat(gwp1Txt) || 0;

        const opt2Prod     = document.getElementById('bnp-new-product')?.value || '—';
        const opt2Var      = document.getElementById('bnp-new-variant')?.value || '—';
        const opt2ScenEl   = document.getElementById('bnp-new-scenario');
        const opt2Scen     = opt2ScenEl && !opt2ScenEl.disabled ? (opt2ScenEl.options[opt2ScenEl.selectedIndex]?.text||'—') : '—';
        const gwp2Txt      = document.getElementById('bnp-res-new')?.textContent || '—';
        const gwp2          = parseFloat(gwp2Txt) || 0;

        const isCompActive = document.getElementById('bnp-section-competitor')?.style.display !== 'none';
        const compProd     = document.getElementById('bnp-comp-product')?.value || '—';
        const compVarEl    = document.getElementById('bnp-comp-variant');
        const compVar      = compVarEl?.value || '—';
        const compScenEl   = document.getElementById('bnp-comp-scenario');
        const compScen     = compScenEl && !compScenEl.disabled ? (compScenEl.options[compScenEl.selectedIndex]?.text||'—') : '—';

        const gwpDiff      = gwp1 > 0 && gwp2 > 0 ? ((gwp1 - gwp2) / gwp1 * 100) : null;
        const winner       = gwp1 > 0 && gwp2 > 0 ? (gwp2 < gwp1 ? opt2Prod : opt1Prod) : null;
        const winnerVar    = gwp2 < gwp1 ? opt2Var : opt1Var;

        const showArea     = document.getElementById('bnp-show-area')?.checked;
        const areaVal      = parseFloat(document.getElementById('bnp-project-area')?.value) || 0;
        const totalBase    = document.getElementById('bnp-total-baseline')?.textContent || '';
        const totalNew     = document.getElementById('bnp-total-new')?.textContent || '';
        const totalSavings = document.getElementById('bnp-total-savings')?.textContent || '';
        const savingsLabel = document.getElementById('bnp-total-label')?.textContent || 'Total Savings:';
        const totalRowVisible = document.getElementById('bnp-total-row')?.style.display !== 'none';

        // ════════════════════════════════════════════════════
        // PAGE 1 — COVER + PRODUCT TABLE + GWP METRICS
        // ════════════════════════════════════════════════════
        fillPage();

        // Top gradient bar
        bg(59,127,245); pdf.rect(0,0,pageW,28,'F');
        bg(17,29,48);   pdf.rect(0,22,pageW,6,'F');

        // Logo — embedded data URI, no fetch needed
        try { pdf.addImage(_LOGO_B64, 'PNG', M, 3, 44, 17); } catch(e) {
            tc(255,255,255); font('bold',22); pdf.text('LINDNER', M, 15);
            tc(200,220,255); font('normal',8); pdf.text('GROUP', M, 20);
        }

        // Report title right side
        tc(255,255,255); font('bold',13);
        pdf.text('Product Lifecycle Assessment', pageW-M, 12, { align:'right' });
        tc(200,220,255); font('normal',8);
        pdf.text('Environmental Impact Comparison Report', pageW-M, 18, { align:'right' });

        // Date + reference line
        tc(107,130,160); font('normal',7.5);
        const dateStr = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
        pdf.text(`Report Date: ${dateStr}`, M, 31);
        pdf.text(`Reference: LCA-${Date.now().toString().slice(-6)}`, pageW-M, 31, { align:'right' });

        let y = 40;

        // ── SECTION 1: Product Comparison Table ──────────────
        y = sectionTitle('01  Product & Scenario Overview', y);

        // Table header
        const c1=M, c2=M+52, c3=M+120, cW1=50, cW2=66, cW3=col-cW1-cW2;
        bg(22,34,54); pdf.rect(M, y, col, 7, 'F');
        tc(107,130,160); font('bold',7.5);
        pdf.text('',      c1+2, y+4.8);
        pdf.text('OPTION 1', c2+2, y+4.8);
        pdf.text('OPTION 2', c3+2, y+4.8);
        y += 7;

        // Table rows
        const rows = [
            { label: 'Product',           v1: opt1Prod,  v2: opt2Prod  },
            { label: 'Variant',           v1: opt1Var,   v2: opt2Var   },
            { label: 'Lifecycle Scenario',v1: opt1Scen,  v2: opt2Scen  },
        ];

        rows.forEach((row, i) => {
            const rowBg = i % 2 === 0 ? [14,22,38] : [17,27,45];
            bg(...rowBg); pdf.rect(M, y, col, 8, 'F');
            tc(107,130,160); font('normal',7.5);
            pdf.text(row.label, c1+2, y+5.2);
            // truncate long text
            const trunc = (s, max=36) => s && s.length > max ? s.slice(0,max)+'…' : (s||'—');
            tc(220,232,248); font('normal',7.5);
            pdf.text(trunc(row.v1), c2+2, y+5.2);
            pdf.text(trunc(row.v2), c3+2, y+5.2);
            y += 8;
        });

        // Competitor row if active
        if (isCompActive && compProd !== '—') {
            y += 4;
            y = sectionTitle('Competitor Reference', y);
            const crows = [
                { label:'Product', v: compProd },
                { label:'Variant', v: compVar },
                { label:'Lifecycle Scenario', v: compScen },
            ];
            crows.forEach((row,i) => {
                bg(i%2===0?[22,10,10]:[26,12,12]); pdf.rect(M,y,col,8,'F');
                bg(240,84,84); pdf.rect(M,y,1.5,8,'F');
                tc(107,130,160); font('normal',7.5); pdf.text(row.label, c1+2, y+5.2);
                const trunc = (s,max=72) => s&&s.length>max?s.slice(0,max)+'…':(s||'—');
                tc(255,180,180); font('normal',7.5); pdf.text(trunc(row.v), c2+2, y+5.2);
                y += 8;
            });
        }

        y = hline(y + 4);

        // ── SECTION 2: GWP Metrics ────────────────────────────
        y = sectionTitle('02  Global Warming Potential (GWP) — A1-C4', y);

        // Three metric boxes
        const bW = (col - 8) / 3;
        const metricBox = (x, by, w, label, value, unit, color, highlight=false) => {
            if (highlight) { bg(...color); pdf.rect(x, by, w, 26, 'F'); }
            else { bg(17,29,48); pdf.rect(x, by, w, 26, 'F'); }
            if (!highlight) { pdf.setDrawColor(...color); pdf.setLineWidth(0.4); pdf.rect(x,by,w,26,'S'); }
            tc(highlight?[8,15,28]:color); font('normal',6.5);
            pdf.text(label.toUpperCase(), x+4, by+6);
            tc(highlight?[8,15,28]:[238,242,248]); font('bold',16);
            pdf.text(value, x+4, by+18);
            tc(highlight?[8,15,28]:[107,130,160]); font('normal',6.5);
            pdf.text(unit, x+4, by+23);
        };

        metricBox(M,       y, bW, 'Option 1 GWP — '+opt1Prod, gwp1Txt, 'kg CO₂e / m²', [107,130,160]);
        metricBox(M+bW+4,  y, bW, 'Option 2 GWP — '+opt2Prod, gwp2Txt, 'kg CO₂e / m²', [0,217,139], gwp2<gwp1);
        if (gwpDiff !== null) {
            const diffTxt = Math.abs(gwpDiff).toFixed(1) + '%';
            const diffColor = gwpDiff > 0 ? [0,217,139] : [240,84,84];
            const diffLabel = gwpDiff > 0 ? 'Carbon Reduction' : 'Carbon Increase';
            metricBox(M+bW*2+8, y, bW, diffLabel, diffTxt, gwpDiff>0?'lower impact':'higher impact', diffColor);
        }
        y += 30;

        // ── SECTION 3: Project Total (if enabled) ─────────────
        if (totalRowVisible && areaVal > 0) {
            y = hline(y + 2);
            y = sectionTitle('03  Total Project Carbon Footprint  (Area: ' + areaVal.toLocaleString() + ' m²)', y);

            const pW = (col - 4) / 2;
            bg(17,29,48); pdf.rect(M, y, pW, 20, 'F');
            tc(107,130,160); font('normal',7); pdf.text('OPTION 1 TOTAL', M+4, y+6);
            tc(238,242,248); font('bold',14); pdf.text(totalBase + ' kg CO₂e', M+4, y+16);

            bg(17,29,48); pdf.rect(M+pW+4, y, pW, 20, 'F');
            tc(107,130,160); font('normal',7); pdf.text('OPTION 2 TOTAL', M+pW+8, y+6);
            tc(0,217,139); font('bold',14); pdf.text(totalNew + ' kg CO₂e', M+pW+8, y+16);

            y += 24;

            // Savings highlight
            bg(0,45,30); pdf.rect(M, y, col, 14, 'F');
            pdf.setDrawColor(0,217,139); pdf.setLineWidth(0.4); pdf.rect(M,y,col,14,'S');
            tc(107,178,130); font('normal',7.5); pdf.text(savingsLabel.toUpperCase(), M+6, y+5.5);
            tc(0,217,139); font('bold',14); pdf.text(totalSavings + ' kg CO₂e', M+6+55, y+5.5);
            tc(107,178,130); font('normal',7); pdf.text('avoided carbon emissions for this project', M+6, y+11);
            y += 18;
        }

        y = hline(y + 2);

        // ── SECTION 4: Conclusion ─────────────────────────────
        y = sectionTitle('04  Conclusion', y);
        bg(17,29,48); pdf.rect(M, y, col, 22, 'F');
        bg(0,217,139); pdf.rect(M, y, 2, 22, 'F');

        let conclusionText = '';
        if (gwpDiff !== null && winner) {
            const abs = Math.abs(gwpDiff).toFixed(1);
            if (gwpDiff > 0) {
                conclusionText = `Based on the LCA data, ${winner} (${winnerVar}) demonstrates a significantly lower environmental impact ` +
                    `under the "${opt1Scen}" lifecycle scenario, reducing Global Warming Potential by ${abs}% ` +
                    `compared to ${gwp2 < gwp1 ? opt1Prod : opt2Prod}. `;
                if (totalRowVisible && areaVal > 0 && totalSavings) {
                    conclusionText += `For a project of ${areaVal.toLocaleString()} m², this represents a total saving of ${totalSavings} kg CO₂e.`;
                }
                if (isCompActive && compProd !== '—') {
                    conclusionText += ` The competitor product (${compProd}) was also evaluated under equivalent conditions for market benchmarking.`;
                }
            } else {
                conclusionText = `Under the "${opt1Scen}" lifecycle scenario, ${opt1Prod} (${opt1Var}) shows a lower GWP than ` +
                    `${opt2Prod} by ${abs}%. Review the scenario selection to ensure a valid comparison basis.`;
            }
        } else {
            conclusionText = 'Complete all selections in Options 1 and 2 to generate a full lifecycle comparison conclusion.';
        }

        tc(200,220,200); font('normal',8);
        const lines = pdf.splitTextToSize(conclusionText, col - 10);
        pdf.text(lines, M+6, y+7);
        y += 26;

        // ── Disclaimer ────────────────────────────────────────
        y = hline(y);
        tc(60,80,110); font('normal',6.5);
        const disclaimer = 'This report is generated from Environmental Product Declaration (EPD) data per ISO 14040/14044 and EN 15804. ' +
            'Results represent cradle-to-grave (A1-C4) Global Warming Potential. Values are per m² declared unit. ' +
            'Lindner Group accepts no liability for decisions made solely on the basis of this tool output.';
        const dlines = pdf.splitTextToSize(disclaimer, col);
        pdf.text(dlines, M, y+4);

        // ════════════════════════════════════════════════════
        // PAGE 2 — BAR CHART CAPTURE
        // ════════════════════════════════════════════════════
        if (btn) btn.style.visibility = 'hidden';

        const chartEl = document.getElementById('bnp-impactChart');
        const compChartEl = document.getElementById('bnp-competitorChart');

        if (chartEl) {
            pdf.addPage();
            fillPage();
            // Taller blue bar for logo on page 2
            bg(59,127,245); pdf.rect(0,0,pageW,22,'F');
            bg(17,29,48);   pdf.rect(0,18,pageW,4,'F');

            // Logo on page 2 header
            try {
                try { pdf.addImage(_LOGO_B64, 'PNG', M, 3, 36, 14); } catch(e) {}
            } catch(e) {
                tc(255,255,255); font('bold',14); pdf.text('LINDNER', M, 14);
            }

            tc(238,242,248); font('bold',12);
            pdf.text('Visual Comparison — GWP Chart', M + 38, 12, { align: 'left' });
            tc(107,130,160); font('normal',7.5);
            pdf.text('A1-C4 Global Warming Potential · kg CO₂e per m²', M + 38, 18);

            // Capture just the chart canvas
            const chartCanvas = await html2canvas(chartEl.closest('.chart-wrapper') || chartEl, {
                backgroundColor:'#111d30', scale:2, useCORS:true, logging:false
            });
            const chartImg = chartCanvas.toDataURL('image/png');
            const cW = col;
            const cH = (chartCanvas.height / chartCanvas.width) * cW;
            pdf.addImage(chartImg, 'PNG', M, 28, cW, Math.min(cH, 100));

            let cy = 28 + Math.min(cH, 100) + 10;

            // Competitor chart if visible
            if (isCompActive && compChartEl) {
                const compEl = document.getElementById('bnp-competitor-results');
                if (compEl && compEl.style.display !== 'none') {
                    cy = sectionTitle('Market Benchmark — Competitor Comparison', cy);
                    const compCanvas = await html2canvas(compChartEl.closest('.chart-wrapper') || compChartEl, {
                        backgroundColor:'#111d30', scale:2, useCORS:true, logging:false
                    });
                    const compImg = compCanvas.toDataURL('image/png');
                    const ccW = col;
                    const ccH = (compCanvas.height / compCanvas.width) * ccW;
                    pdf.addImage(compImg, 'PNG', M, cy, ccW, Math.min(ccH, 90));
                    cy += Math.min(ccH, 90) + 10;
                }
            }

            // Data table below chart
            cy = hline(cy + 4);
            cy = sectionTitle('Raw Data Reference', cy);
            bg(22,34,54); pdf.rect(M, cy, col, 7, 'F');
            tc(107,130,160); font('bold',7);
            pdf.text('PRODUCT', M+4, cy+4.8);
            pdf.text('VARIANT', M+60, cy+4.8);
            pdf.text('SCENARIO', M+130, cy+4.8);
            pdf.text('GWP (kg CO₂e/m²)', M+185, cy+4.8);
            cy += 7;

            const dataRows = [
                { prod:opt1Prod, var:opt1Var, scen:opt1Scen, gwp:gwp1Txt, color:[107,130,160] },
                { prod:opt2Prod, var:opt2Var, scen:opt2Scen, gwp:gwp2Txt, color:[0,217,139] },
            ];
            if (isCompActive && compProd!=='—') {
                dataRows.push({ prod:compProd, var:compVar, scen:compScen, gwp:'—', color:[240,84,84] });
            }

            dataRows.forEach((r,i) => {
                bg(i%2===0?14:17, i%2===0?22:27, i%2===0?38:45);
                pdf.rect(M,cy,col,9,'F');
                bg(...r.color); pdf.rect(M,cy,2,9,'F');
                tc(...r.color); font('bold',7.5); pdf.text(r.prod, M+4, cy+5.8);
                tc(200,215,235); font('normal',7);
                const trunc = (s,n=30) => s&&s.length>n?s.slice(0,n)+'…':(s||'—');
                pdf.text(trunc(r.var,32), M+60, cy+5.8);
                pdf.text(trunc(r.scen,28), M+130, cy+5.8);
                tc(...r.color); font('bold',8); pdf.text(r.gwp, M+185, cy+5.8);
                cy += 9;
            });
        }

        if (btn) btn.style.visibility = 'visible';

        // ── Footer on ALL pages ───────────────────────────────
        const totalPages = pdf.internal.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            pdf.setPage(p);
            bg(17,29,48); pdf.rect(0, pageH-8, pageW, 8, 'F');
            blueBar(pageH-1, 1);
            tc(107,130,160); font('normal',6.5);
            pdf.text('LINDNER GROUP · Product Lifecycle Assessment Tool · www.lindner-group.com', M, pageH-3.5);
            pdf.text(`Page ${p} / ${totalPages}`, pageW-M, pageH-3.5, { align:'right' });
        }

        const safe = s => (s||'unknown').replace(/[^a-zA-Z0-9]/g,'_').slice(0,20);
        const fileName = `Lindner_LCA_${safe(opt1Prod)}_vs_${safe(opt2Prod)}_${new Date().toISOString().slice(0,10)}.pdf`;
        pdf.save(fileName);

    } catch (err) {
        console.error('PDF export failed:', err);
        alert('PDF generation failed: ' + err.message);
    }

    btn.classList.remove('loading');
    btn.textContent = '⬇ Export PDF';
};


// =======================================================
// FULLSCREEN 3D MODAL  — Panel View + Room View
// =======================================================

// Single mutable state — no races, no stale closures
let _modal = { rafId: null, renderer: null, cleanups: [] };

function _stopModal() {
    if (_modal.rafId)    { cancelAnimationFrame(_modal.rafId); _modal.rafId = null; }
    if (_modal.renderer) { try { _modal.renderer.dispose(); } catch(e) {} _modal.renderer = null; }
    _modal.cleanups.forEach(fn => { try { fn(); } catch(e) {} });
    _modal.cleanups = [];
    const wrap = document.getElementById('modal-3d-canvas-wrap');
    if (wrap) wrap.innerHTML = '';
}

let _modalProd = null;
let _modalMode = 'panel';

// ── Mode switcher ───────────────────────────────────────
window.switchModalMode = function(mode) {
    _modalMode = mode;
    document.querySelectorAll('.modal-mode-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === mode));
    const hintEl = document.getElementById('modal-hint');
    if (hintEl) hintEl.textContent = mode === 'panel'
        ? 'DRAG TO ROTATE · SCROLL TO ZOOM'
        : 'DRAG TO LOOK AROUND · AUTO-ORBITS WHEN IDLE';
    if (_modalProd) _launchModalScene(_modalProd, mode);
};

// ── Public entry ────────────────────────────────────────
function openModal3D(prod) {
    _modalProd = prod;
    const pedEl = document.getElementById("bnp-include-pedestals") || document.getElementById("np-include-pedestals");
    prod.includePedestals = pedEl ? pedEl.checked : false;
    _modalMode = 'panel';
    const overlay = document.getElementById('modal-3d-overlay');
    if (!overlay) return;
    document.getElementById('modal-3d-name').textContent = prod.name || 'Product';
    const gwpEl = document.getElementById('modal-3d-gwp');
    gwpEl.textContent = (prod.gwp || 0).toFixed(2);
    gwpEl.style.color = prod.isWinner ? 'var(--success)' : '#eef2f8';
    const linkEl = document.getElementById('modal-3d-link');
    if (prod.url) { linkEl.href = prod.url; linkEl.classList.add('visible'); }
    else          { linkEl.classList.remove('visible'); }
    const hintEl = document.getElementById('modal-hint');
    if (hintEl) hintEl.textContent = 'DRAG TO ROTATE · SCROLL TO ZOOM';
    document.querySelectorAll('.modal-mode-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === 'panel'));
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    _launchModalScene(prod, 'panel');
}

// ── Scene launcher ──────────────────────────────────────
function _launchModalScene(prod, mode) {
    _stopModal();
    const wrap = document.getElementById('modal-3d-canvas-wrap');
    if (!wrap) return;
    let attempts = 0;
    const tryBuild = () => {
        const W = wrap.clientWidth, H = wrap.clientHeight;
        if (W < 10 || H < 10) { if (++attempts < 60) requestAnimationFrame(tryBuild); return; }
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(W, H);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
        wrap.appendChild(renderer.domElement);
        _modal.renderer = renderer;
        const onKey = e => { if (e.key === 'Escape') closeModal3D(); };
        document.addEventListener('keydown', onKey);
        _modal.cleanups.push(() => document.removeEventListener('keydown', onKey));
        if (mode === 'panel') _buildPanelScene(renderer, wrap, W, H, prod);
        else                  _buildRoomScene(renderer, wrap, W, H, prod);
    };
    requestAnimationFrame(tryBuild);
}

// ════════════════════════════════════════════════════════
// MODE 1 — SPINNING PANEL
// ════════════════════════════════════════════════════════
function _buildPanelScene(renderer, wrap, W, H, prod) {
    renderer.setClearColor(0x060d1a, 1);
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, W/H, 0.1, 200);
    camera.position.set(0, 0, 4.5);

    scene.add(new THREE.AmbientLight(0x3b7ff5, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(4, 4, 6); scene.add(key);
    const fill = new THREE.DirectionalLight(0x00d98b, 0.35);
    fill.position.set(-4, -2, -3); scene.add(fill);
    const top = new THREE.DirectionalLight(0x7c3aed, 0.2);
    top.position.set(0, 6, 0); scene.add(top);

    const geo     = new THREE.BoxGeometry(3.6, 2.3, 0.1);
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x162236, roughness: 0.8, metalness: 0.3 });
    const rimColor = prod.isWinner ? 0x00d98b : 0x3b7ff5;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.9),
        new THREE.MeshBasicMaterial({ color: rimColor, transparent: true, opacity: 0.06, side: THREE.DoubleSide }));
    glow.position.z = -0.3; scene.add(glow);

    let panel = null;
    const addPanel = mat => { panel = new THREE.Mesh(geo, [darkMat,darkMat,darkMat,darkMat,mat,darkMat]); scene.add(panel); };
    const useFallback = () => addPanel(new THREE.MeshStandardMaterial({ map: _makeFallbackTexture(prod), roughness: 0.4 }));
    const imgPath = getProductImage(prod.name);
    if (imgPath) {
        new THREE.TextureLoader().load(imgPath,
            tex => { tex.encoding = THREE.sRGBEncoding; addPanel(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.05 })); },
            undefined, useFallback);
    } else { useFallback(); }

    let isDragging=false, prevX=0, prevY=0;
    let rotX=0, rotY=0, targetRotX=0, targetRotY=0, zoom=4.5, targetZoom=4.5;
    const onDown  = e => { isDragging=true; prevX=e.clientX||e.touches?.[0]?.clientX||0; prevY=e.clientY||e.touches?.[0]?.clientY||0; };
    const onMove  = e => {
        if (!isDragging) return;
        const cx=e.clientX||e.touches?.[0]?.clientX||0, cy=e.clientY||e.touches?.[0]?.clientY||0;
        targetRotY += (cx-prevX)*0.007; targetRotX += (cy-prevY)*0.007;
        targetRotX = Math.max(-1.1, Math.min(1.1, targetRotX));
        prevX=cx; prevY=cy;
    };
    const onUp    = () => { isDragging=false; };
    const onWheel = e => { targetZoom=Math.max(2.5, Math.min(8, targetZoom+e.deltaY*0.008)); };
    wrap.addEventListener('mousedown',  onDown);
    wrap.addEventListener('mousemove',  onMove);
    wrap.addEventListener('mouseup',    onUp);
    wrap.addEventListener('mouseleave', onUp);
    wrap.addEventListener('touchstart', onDown,  {passive:true});
    wrap.addEventListener('touchmove',  onMove,  {passive:true});
    wrap.addEventListener('touchend',   onUp);
    wrap.addEventListener('wheel',      onWheel, {passive:true});
    _modal.cleanups.push(() => {
        wrap.removeEventListener('mousedown',  onDown);
        wrap.removeEventListener('mousemove',  onMove);
        wrap.removeEventListener('mouseup',    onUp);
        wrap.removeEventListener('mouseleave', onUp);
        wrap.removeEventListener('wheel',      onWheel);
    });

    let t = 0;
    const tick = () => {
        _modal.rafId = requestAnimationFrame(tick);
        t += 0.01;
        rotX += (targetRotX-rotX)*0.1; rotY += (targetRotY-rotY)*0.1;
        zoom += (targetZoom-zoom)*0.1;  camera.position.z = zoom;
        if (panel) {
            if (!isDragging) targetRotY += 0.004;
            panel.rotation.x = rotX; panel.rotation.y = rotY;
            panel.position.y = Math.sin(t*0.6)*0.04;
        }
        renderer.render(scene, camera);
    };
    tick();
}

// ════════════════════════════════════════════════════════
// MODE 2 & 3 — ROOM SCENE
// ════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════
// FLOOR PROFILE — maps product name → construction type
// ════════════════════════════════════════════════════════
function getFloorProfile(name) {
    const n = (name || '').toUpperCase().trim();
    // Hollow floor systems
    if (n.includes('FLOOR AND MORE') || n.includes('FLOOR & MORE') || n === 'NORIT') {
        return { type:'hollow', panel:'calcium', steelTop:false, steelBottom:false, refurbished:false };
    }
    if (n === 'ADDLIFE') {
        return { type:'hollow', panel:'calcium', steelTop:false, steelBottom:false, refurbished:true };
    }
    // Raised access — NORTEC family
    if (n === 'NORTEC') {
        return { type:'raised', panel:'calcium', steelTop:false, steelBottom:false, refurbished:false };
    }
    if (n === 'LOOP') {
        return { type:'raised', panel:'calcium', steelTop:false, steelBottom:false, refurbished:true };
    }
    // Raised access — LIGNA family
    if (n === 'LIGNA') {
        return { type:'raised', panel:'chipboard', steelTop:false, steelBottom:false, refurbished:false };
    }
    if (n === 'LIGNA ST') {
        return { type:'raised', panel:'chipboard', steelTop:true,  steelBottom:false, refurbished:false };
    }
    if (n === 'LIGNA ST ST') {
        return { type:'raised', panel:'chipboard', steelTop:true,  steelBottom:true,  refurbished:false };
    }
    // Raised access — RELIFE family
    if (n === 'RELIFE') {
        return { type:'raised', panel:'chipboard', steelTop:false, steelBottom:false, refurbished:true };
    }
    if (n === 'RELIFE ST') {
        return { type:'raised', panel:'chipboard', steelTop:true,  steelBottom:false, refurbished:true };
    }
    if (n === 'RELIFE ST ST') {
        return { type:'raised', panel:'chipboard', steelTop:true,  steelBottom:true,  refurbished:true };
    }
    // Default fallback — raised calcium sulphate
    return { type:'raised', panel:'calcium', steelTop:false, steelBottom:false, refurbished:false };
}

// ════════════════════════════════════════════════════════
// MODE 2 — ROOM VIEW  (smart floor cross-section)
// ════════════════════════════════════════════════════════
function _buildRoomScene(renderer, wrap, W, H, prod) {
    const fp  = getFloorProfile(prod.name);
    const ped = prod.includePedestals && fp.type === 'raised';

    // ── Renderer ─────────────────────────────────────────
    renderer.setClearColor(0x0b1120, 1);
    renderer.shadowMap.enabled   = true;
    renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
    renderer.physicallyCorrectLights = true;
    renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene  = new THREE.Scene();
    scene.fog    = new THREE.Fog(0x0b1120, 9, 18);
    const camera = new THREE.PerspectiveCamera(52, W/H, 0.05, 30);

    // ── Room dimensions (metres) ──────────────────────────
    const RW=6, RH=3.2, RD=6;           // room: 6m wide, 3.2m tall, 6m deep

    // ── Floor layer heights (exaggerated ~3× for legibility) ──
    const PANEL_H = 0.09;
    const STEEL_H = 0.022;
    const PED_H   = ped ? 0.26 : 0.0;

    const yBot      = fp.steelBottom ? PED_H + STEEL_H : PED_H;
    const yPanelTop = yBot + PANEL_H;
    const yFinished = fp.steelTop ? yPanelTop + STEEL_H : yPanelTop;

    // ── Lighting ─────────────────────────────────────────
    // Ambient
    scene.add(new THREE.AmbientLight(0x8899bb, 0.45));

    // Main ceiling downlight (key light)
    const key = new THREE.SpotLight(0xfff8e8, 2.8, 12, Math.PI*0.28, 0.45, 1.2);
    key.position.set(0, RH-0.05, -0.5);
    key.target.position.set(0, 0, 1);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.001;
    scene.add(key); scene.add(key.target);

    // Second fill downlight
    const fill = new THREE.SpotLight(0xfff5e0, 1.4, 10, Math.PI*0.3, 0.5, 1.5);
    fill.position.set(-1.5, RH-0.05, 1.5);
    fill.target.position.set(-1, 0, 2);
    scene.add(fill); scene.add(fill.target);

    // Cool blue accent from window side
    const winLight = new THREE.PointLight(0x6688cc, 0.6, 8);
    winLight.position.set(RW/2-0.2, RH*0.7, 0);
    scene.add(winLight);

    // Warm bounce off back wall
    const bounce = new THREE.PointLight(0xffd088, 0.35, 6);
    bounce.position.set(0, 1.2, -RD/2+0.5);
    scene.add(bounce);

    // ── Canvas texture helper ─────────────────────────────
    const makeCanvas = (sz, draw) => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = sz;
        draw(cv.getContext('2d'), sz);
        const t = new THREE.CanvasTexture(cv);
        t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        return t;
    };

    // ── FLOOR TILE TEXTURE ────────────────────────────────
    // One tile = 0.6×0.6m. Floor covers entire room.
    const makePanelTex = () => makeCanvas(512, (ctx, sz) => {
        const isChip = fp.panel === 'chipboard';
        const isHollow = fp.type === 'hollow';

        if (isHollow) {
            // Warm sandy calcium sulphate
            const gr = ctx.createLinearGradient(0,0,sz,sz);
            gr.addColorStop(0,'#d4c8a8'); gr.addColorStop(0.5,'#c8bc98'); gr.addColorStop(1,'#d0c4a2');
            ctx.fillStyle=gr; ctx.fillRect(0,0,sz,sz);
            for(let i=0;i<1200;i++){
                const v=192+Math.floor(Math.random()*18-9);
                ctx.fillStyle=`rgba(${Math.floor(v*0.92)},${Math.floor(v*0.88)},${Math.floor(v*0.78)},0.18)`;
                ctx.fillRect(Math.random()*sz,Math.random()*sz,1.5,1.5);
            }
            ctx.strokeStyle='rgba(255,248,225,0.45)'; ctx.lineWidth=2.5;
            ctx.beginPath();ctx.moveTo(5,5);ctx.lineTo(sz-5,5);ctx.stroke();
            ctx.beginPath();ctx.moveTo(5,5);ctx.lineTo(5,sz-5);ctx.stroke();
            ctx.strokeStyle='rgba(80,65,35,0.28)'; ctx.lineWidth=2.5;
            ctx.beginPath();ctx.moveTo(5,sz-5);ctx.lineTo(sz-5,sz-5);ctx.stroke();
            ctx.beginPath();ctx.moveTo(sz-5,5);ctx.lineTo(sz-5,sz-5);ctx.stroke();
            ctx.strokeStyle='#5a4e30'; ctx.lineWidth=9;
            ctx.strokeRect(4,4,sz-8,sz-8);
        } else if (isChip) {
            const gr=ctx.createLinearGradient(0,0,sz,sz);
            gr.addColorStop(0,'#c8905a'); gr.addColorStop(0.4,'#b87840'); gr.addColorStop(1,'#c8905a');
            ctx.fillStyle=gr; ctx.fillRect(0,0,sz,sz);
            ctx.strokeStyle='rgba(80,40,8,0.22)'; ctx.lineWidth=1.0;
            for(let i=0;i<120;i++){
                const x0=Math.random()*sz,x1=x0+(Math.random()-0.5)*60;
                ctx.beginPath();ctx.moveTo(x0,0);ctx.lineTo(x1,sz);ctx.stroke();
            }
            for(let i=0;i<300;i++){
                const x=Math.random()*sz,y=Math.random()*sz,v=140+Math.floor(Math.random()*40-20);
                ctx.fillStyle=`rgba(${v},${Math.floor(v*0.6)},${Math.floor(v*0.3)},0.15)`;
                ctx.fillRect(x,y,Math.random()*4+1,Math.random()*2+0.5);
            }
            ctx.strokeStyle='rgba(255,255,255,0.42)'; ctx.lineWidth=2.5;
            ctx.beginPath();ctx.moveTo(5,5);ctx.lineTo(sz-5,5);ctx.stroke();
            ctx.beginPath();ctx.moveTo(5,5);ctx.lineTo(5,sz-5);ctx.stroke();
            ctx.strokeStyle='rgba(0,0,0,0.28)'; ctx.lineWidth=2.5;
            ctx.beginPath();ctx.moveTo(5,sz-5);ctx.lineTo(sz-5,sz-5);ctx.stroke();
            ctx.beginPath();ctx.moveTo(sz-5,5);ctx.lineTo(sz-5,sz-5);ctx.stroke();
            ctx.strokeStyle='#2a1e0a'; ctx.lineWidth=9;
            ctx.strokeRect(4,4,sz-8,sz-8);
        } else {
            // Calcium sulphate — cool grey
            ctx.fillStyle='#c5cad2'; ctx.fillRect(0,0,sz,sz);
            for(let i=0;i<1000;i++){
                const v=188+Math.floor(Math.random()*22-11);
                ctx.fillStyle=`rgba(${v},${v},${v},0.18)`;
                ctx.fillRect(Math.random()*sz,Math.random()*sz,1.5,1.5);
            }
            ctx.strokeStyle='rgba(255,255,255,0.45)'; ctx.lineWidth=2.5;
            ctx.beginPath();ctx.moveTo(5,5);ctx.lineTo(sz-5,5);ctx.stroke();
            ctx.beginPath();ctx.moveTo(5,5);ctx.lineTo(5,sz-5);ctx.stroke();
            ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=2.5;
            ctx.beginPath();ctx.moveTo(5,sz-5);ctx.lineTo(sz-5,sz-5);ctx.stroke();
            ctx.beginPath();ctx.moveTo(sz-5,5);ctx.lineTo(sz-5,sz-5);ctx.stroke();
            ctx.strokeStyle='#2c3040'; ctx.lineWidth=9;
            ctx.strokeRect(4,4,sz-8,sz-8);
        }
    });

    const panelTex = makePanelTex();
    panelTex.wrapS = panelTex.wrapT = THREE.RepeatWrapping;
    panelTex.repeat.set(RW/0.6, RD/0.6);  // 60cm tile grid over whole floor

    const isChip    = fp.panel === 'chipboard';
    const panelMat  = new THREE.MeshStandardMaterial({
        map: panelTex,
        roughness: isChip ? 0.88 : 0.82,
        metalness: 0.01,
        color: fp.type==='hollow' ? 0xd4c89a : (isChip ? 0xd49070 : 0xd0d4d8)
    });
    const edgeColor = fp.type==='hollow' ? 0xb0a080 : (isChip ? 0x8a5820 : 0x8a9099);
    const edgeMat   = new THREE.MeshStandardMaterial({ color: edgeColor, roughness: 0.9 });

    // ── STEEL SHEET MATERIAL ──────────────────────────────
    const steelTex = makeCanvas(128,(ctx,sz)=>{
        ctx.fillStyle='#b0b6c4'; ctx.fillRect(0,0,sz,sz);
        ctx.strokeStyle='rgba(255,255,255,0.14)'; ctx.lineWidth=0.5;
        for(let i=0;i<sz;i+=4){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,sz);ctx.stroke();}
    });
    steelTex.wrapS=steelTex.wrapT=THREE.RepeatWrapping; steelTex.repeat.set(RW/0.6,RD/0.6);
    const steelMat = new THREE.MeshStandardMaterial({map:steelTex,roughness:0.2,metalness:0.8,color:0xc0c8d8});

    // ── FULL FLOOR PANEL SLAB ─────────────────────────────
    // Only the RAISED part — covers entire room at finished height
    if (fp.type === 'raised') {
        if (fp.steelBottom) {
            const sb = new THREE.Mesh(new THREE.BoxGeometry(RW, STEEL_H, RD), steelMat);
            sb.position.set(0, PED_H + STEEL_H/2, 0);
            sb.castShadow = true; sb.receiveShadow = true; scene.add(sb);
        }
        const panelBox = new THREE.Mesh(
            new THREE.BoxGeometry(RW, PANEL_H, RD),
            [edgeMat, edgeMat, panelMat, edgeMat, edgeMat, edgeMat]
        );
        panelBox.position.set(0, yBot + PANEL_H/2, 0);
        panelBox.castShadow = true; panelBox.receiveShadow = true; scene.add(panelBox);

        if (fp.steelTop) {
            const st = new THREE.Mesh(new THREE.BoxGeometry(RW, STEEL_H, RD), steelMat);
            st.position.set(0, yPanelTop + STEEL_H/2, 0);
            st.castShadow = true; scene.add(st);
        }
    } else {
        // HOLLOW — single slab
        const slabH = PANEL_H + 0.05;
        const hollowBox = new THREE.Mesh(
            new THREE.BoxGeometry(RW, slabH, RD),
            [edgeMat, edgeMat, panelMat, edgeMat, edgeMat, edgeMat]
        );
        hollowBox.position.set(0, slabH/2, 0);
        hollowBox.castShadow = true; hollowBox.receiveShadow = true; scene.add(hollowBox);
    }

    // ── PEDESTALS — 0.6m grid, 4 per m², across whole floor ──
    if (ped) {
        const shaftMat = new THREE.MeshStandardMaterial({color:0x6a7280,roughness:0.5,metalness:0.55});
        const plateMat = new THREE.MeshStandardMaterial({color:0x4e5562,roughness:0.4,metalness:0.65});
        const nutMat   = new THREE.MeshStandardMaterial({color:0x8a9099,roughness:0.3,metalness:0.75});

        // Grid: one pedestal every 0.6m — at panel corners
        // Room is RW×RD, pedestals at -RW/2+0.3, ..., +RW/2-0.3 etc.
        const xs = [], zs = [];
        for (let x = -RW/2 + 0.3; x <= RW/2 - 0.28; x += 0.6) xs.push(x);
        for (let z = -RD/2 + 0.3; z <= RD/2 - 0.28; z += 0.6) zs.push(z);

        xs.forEach(px => zs.forEach(pz => {
            // Base plate
            const bp = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.008,0.12), plateMat);
            bp.position.set(px, 0.004, pz); bp.castShadow=true; scene.add(bp);
            // Lower shaft
            const ls = new THREE.Mesh(new THREE.CylinderGeometry(0.013,0.015,PED_H*0.42,10), shaftMat);
            ls.position.set(px, PED_H*0.22, pz); ls.castShadow=true; scene.add(ls);
            // Hex nut
            const nt = new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.016,6), nutMat);
            nt.position.set(px, PED_H*0.44, pz); scene.add(nt);
            // Upper shaft
            const us = new THREE.Mesh(new THREE.CylinderGeometry(0.011,0.013,PED_H*0.36,10), shaftMat);
            us.position.set(px, PED_H*0.68, pz); us.castShadow=true; scene.add(us);
            // Head disc
            const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.042,0.042,0.010,14), plateMat);
            hd.position.set(px, PED_H-0.005, pz); scene.add(hd);
        }));
    }

    // ── SCREED SLAB — thin but solid, gives pedestals something to stand on ──
    // Visible screed texture: dark grey with fine aggregate speckle
    const screedTex = makeCanvas(256,(ctx,sz)=>{
        ctx.fillStyle='#282c38'; ctx.fillRect(0,0,sz,sz);
        for(let i=0;i<1800;i++){
            const v=38+Math.floor(Math.random()*16-8);
            ctx.fillStyle=`rgba(${v},${v},${v+2},0.55)`;
            ctx.fillRect(Math.random()*sz,Math.random()*sz,1,1);
        }
        // Faint trowel lines
        ctx.strokeStyle='rgba(60,65,80,0.18)'; ctx.lineWidth=0.7;
        for(let i=0;i<14;i++){
            ctx.beginPath();ctx.moveTo(Math.random()*sz,0);ctx.lineTo(Math.random()*sz,sz);ctx.stroke();
        }
    });
    screedTex.wrapS=screedTex.wrapT=THREE.RepeatWrapping; screedTex.repeat.set(6,6);
    const SCREED_H = 0.018;  // 18mm slab — visible but not dominating
    const screedMat = new THREE.MeshStandardMaterial({map:screedTex,roughness:0.97,metalness:0.0,color:0x22262e});
    const screedSlab = new THREE.Mesh(new THREE.BoxGeometry(RW,SCREED_H,RD), screedMat);
    screedSlab.position.set(0, -SCREED_H/2, 0);
    screedSlab.receiveShadow = true;
    scene.add(screedSlab);

    // ── ROOM WALLS ────────────────────────────────────────
    const wallTex = makeCanvas(512,(ctx,sz)=>{
        // Light plaster — off-white, subtle warmth
        ctx.fillStyle='#d8dde6'; ctx.fillRect(0,0,sz,sz);
        for(let i=0;i<800;i++){
            const v=210+Math.floor(Math.random()*12-6);
            ctx.fillStyle=`rgba(${v},${v},${Math.floor(v*1.02)},0.3)`;
            ctx.fillRect(Math.random()*sz,Math.random()*sz,2,2);
        }
        // Faint horizontal texture lines
        ctx.strokeStyle='rgba(200,205,215,0.12)'; ctx.lineWidth=0.8;
        for(let y=0;y<sz;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(sz,y);ctx.stroke();}
    });
    wallTex.wrapS=wallTex.wrapT=THREE.RepeatWrapping; wallTex.repeat.set(3,1.5);
    const wallMat  = new THREE.MeshStandardMaterial({map:wallTex,roughness:0.92,metalness:0.0,color:0xd0d8e0});
    const wallMat2 = new THREE.MeshStandardMaterial({map:wallTex,roughness:0.92,metalness:0.0,color:0xc8d0d8});

    // Back wall
    const backW = new THREE.Mesh(new THREE.PlaneGeometry(RW, RH), wallMat);
    backW.position.set(0, RH/2, -RD/2);
    backW.receiveShadow=true; scene.add(backW);

    // Left wall
    const leftW = new THREE.Mesh(new THREE.PlaneGeometry(RD, RH), wallMat2);
    leftW.rotation.y = Math.PI/2;
    leftW.position.set(-RW/2, RH/2, 0);
    leftW.receiveShadow=true; scene.add(leftW);

    // Right wall (with window cutout — just slightly darker panel)
    const rightW = new THREE.Mesh(new THREE.PlaneGeometry(RD, RH), wallMat2);
    rightW.rotation.y = -Math.PI/2;
    rightW.position.set(RW/2, RH/2, 0);
    rightW.receiveShadow=true; scene.add(rightW);

    // Window on right wall — glowing rectangle
    const winMat = new THREE.MeshStandardMaterial({
        color:0x88ccff, emissive:0x4488bb, emissiveIntensity:0.7,
        roughness:0.1, metalness:0.1, transparent:true, opacity:0.85
    });
    const winFrame = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), winMat);
    winFrame.rotation.y = -Math.PI/2;
    winFrame.position.set(RW/2-0.005, RH*0.62, -0.4);
    scene.add(winFrame);

    // Window frame border
    const frameMat = new THREE.MeshStandardMaterial({color:0xf0f0f0,roughness:0.6});
    const frameH = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.04, 0.04), frameMat);
    [[RH*0.62+0.52,-0.4],[RH*0.62-0.52,-0.4]].forEach(([y,z])=>{
        const f=frameH.clone(); f.position.set(RW/2-0.02,y,z);f.rotation.y=-Math.PI/2; scene.add(f);
    });
    const frameV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.08, 0.04), frameMat);
    [[-0.4-0.76,-0.4+0.76]].forEach(()=>{
        [-0.4-0.72,-0.4+0.72].forEach(z=>{
            const f=frameV.clone(); f.position.set(RW/2-0.02,RH*0.62,z); scene.add(f);
        });
    });

    // ── DOOR on back wall ─────────────────────────────────
    // Door opening: 0.9m wide, 2.1m tall, centred right of back wall
    const DX=1.2, DW=0.9, DH=2.1;
    const doorFrameMat = new THREE.MeshStandardMaterial({color:0xd4c8a8,roughness:0.7,metalness:0.05});
    const doorMat      = new THREE.MeshStandardMaterial({color:0xc8bfa0,roughness:0.65,metalness:0.05});

    // Door slab (slightly open — rotated ~20°)
    const doorSlab = new THREE.Mesh(new THREE.BoxGeometry(DW, DH, 0.04), doorMat);
    doorSlab.position.set(DX - DW/2 * Math.cos(0.35), DH/2, -RD/2 + DW/2 * Math.sin(0.35) + 0.02);
    doorSlab.rotation.y = 0.35;
    doorSlab.castShadow = true; scene.add(doorSlab);

    // Door frame (top + two sides)
    const dfTop  = new THREE.Mesh(new THREE.BoxGeometry(DW+0.1, 0.08, 0.08), doorFrameMat);
    dfTop.position.set(DX, DH+0.04, -RD/2+0.04); scene.add(dfTop);
    [-DW/2, DW/2].forEach(ox=>{
        const dfS=new THREE.Mesh(new THREE.BoxGeometry(0.08,DH,0.08),doorFrameMat);
        dfS.position.set(DX+ox,-(-DH/2),-RD/2+0.04);  // typo fix below
        dfS.position.set(DX+ox, DH/2, -RD/2+0.04);
        scene.add(dfS);
    });

    // Door handle
    const handleMat = new THREE.MeshStandardMaterial({color:0xd4aa50,roughness:0.2,metalness:0.9});
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.12,8), handleMat);
    handle.rotation.z = Math.PI/2;
    handle.position.set(DX-DW/2+0.08, DH/2, -RD/2+0.06);
    scene.add(handle);

    // ── CEILING ───────────────────────────────────────────
    const ceilMat = new THREE.MeshStandardMaterial({color:0xeef0f4,roughness:0.95});
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW,RD), ceilMat);
    ceil.rotation.x = Math.PI/2;
    ceil.position.set(0, RH, 0);
    ceil.receiveShadow = true; scene.add(ceil);

    // Ceiling light housings (recessed)
    const lightHousingMat = new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xfff8e8,emissiveIntensity:1.2});
    [[0,-0.5],[-1.5,1.5],[1.5,1.5]].forEach(([lx,lz])=>{
        const lh = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.04,16), lightHousingMat);
        lh.position.set(lx, RH-0.02, lz); scene.add(lh);
    });

    // Ceiling cornice (where wall meets ceiling)
    const corniceMat = new THREE.MeshStandardMaterial({color:0xe8ecf0,roughness:0.9});
    const CLEN=0.06;
    [
        [new THREE.BoxGeometry(RW,CLEN,CLEN), [0,RH-CLEN/2,-RD/2+CLEN/2], [0,0,0]],
        [new THREE.BoxGeometry(CLEN,CLEN,RD), [-RW/2+CLEN/2,RH-CLEN/2,0], [0,0,0]],
        [new THREE.BoxGeometry(CLEN,CLEN,RD), [RW/2-CLEN/2,RH-CLEN/2,0], [0,0,0]],
    ].forEach(([geo,pos])=>{
        const m=new THREE.Mesh(geo,corniceMat);
        m.position.set(...pos); scene.add(m);
    });

    // Skirting boards
    const skirtMat = new THREE.MeshStandardMaterial({color:0xdde0e8,roughness:0.8});
    const SKIRT_H=0.1, SKIRT_D=0.015;
    [
        [new THREE.BoxGeometry(RW,SKIRT_H,SKIRT_D), [0,SKIRT_H/2,-RD/2+SKIRT_D/2]],
        [new THREE.BoxGeometry(SKIRT_D,SKIRT_H,RD), [-RW/2+SKIRT_D/2,SKIRT_H/2,0]],
        [new THREE.BoxGeometry(SKIRT_D,SKIRT_H,RD), [RW/2-SKIRT_D/2,SKIRT_H/2,0]],
    ].forEach(([geo,pos])=>{
        const m=new THREE.Mesh(geo,skirtMat);
        m.position.set(...pos);
        m.receiveShadow=true; scene.add(m);
    });

    // ── HUD layer labels ──────────────────────────────────
    const hud=document.createElement('div');
    hud.style.cssText=`position:absolute;top:0;right:0;height:100%;width:188px;
        pointer-events:none;z-index:5;display:flex;flex-direction:column;
        justify-content:center;gap:5px;padding:0 10px 0 0;`;
    const layers=[];
    if(fp.steelTop)              layers.push({l:'Steel sheet (top)',     c:'#c2cad8'});
    if(fp.type==='raised')       layers.push({l:fp.panel==='chipboard'?'Chipboard panel':'Calcium sulphate', c:fp.panel==='chipboard'?'#d4935a':'#b8c2cc'});
    else                         layers.push({l:'Hollow floor slab',     c:'#d4b86a'});
    if(fp.steelBottom)           layers.push({l:'Steel sheet (bottom)',  c:'#b0b8c8'});
    if(fp.type==='hollow')       layers.push({l:'Hollow cavities',       c:'#2266cc'});
    if(ped)                      layers.push({l:'Air gap · 4 ped/m²',   c:'#3b7ff5'});
    else if(fp.type==='raised')  layers.push({l:'Direct on screed',      c:'#445060'});
    layers.forEach(({l,c})=>{
        const t=document.createElement('div');
        t.style.cssText=`background:rgba(6,10,20,0.85);backdrop-filter:blur(8px);
            border:1px solid ${c}44;border-left:3px solid ${c};
            border-radius:0 6px 6px 0;padding:5px 10px;
            color:${c};font-family:'DM Mono',monospace;font-size:0.58rem;
            letter-spacing:1px;text-transform:uppercase;white-space:nowrap;`;
        t.textContent=l; hud.appendChild(t);
    });
    wrap.appendChild(hud);

    // Refurbished badge
    if(fp.refurbished){
        const badge=document.createElement('div');
        badge.style.cssText=`position:absolute;top:12px;left:12px;z-index:10;
            background:rgba(0,217,139,0.12);border:1px solid #00d98b;
            border-radius:20px;padding:4px 14px;color:#00d98b;
            font-family:'DM Mono',monospace;font-size:0.65rem;
            letter-spacing:1.5px;font-weight:600;pointer-events:none;`;
        badge.textContent='♻ REFURBISHED'; wrap.appendChild(badge);
    }

    // Product label
    const lbl=document.createElement('div');
    lbl.style.cssText=`position:absolute;bottom:12px;left:50%;transform:translateX(-50%);
        background:rgba(6,10,20,0.88);backdrop-filter:blur(10px);
        border:1px solid rgba(59,127,245,0.3);border-radius:10px;
        padding:6px 20px;color:#eef2f8;font-family:'DM Mono',monospace;
        font-size:0.68rem;letter-spacing:1.5px;pointer-events:none;
        white-space:nowrap;text-transform:uppercase;z-index:10;`;
    lbl.textContent=(prod.name||'')+'  ·  '+(prod.gwp||0).toFixed(2)+' kg CO₂e / m²';
    wrap.appendChild(lbl);

    // ── Hint label ────────────────────────────────────────
    const hint=document.createElement('div');
    hint.style.cssText=`position:absolute;bottom:44px;left:50%;transform:translateX(-50%);
        color:rgba(107,130,160,0.7);font-family:'DM Mono',monospace;font-size:0.58rem;
        letter-spacing:1.2px;pointer-events:none;white-space:nowrap;`;
    hint.textContent='DRAG TO ROTATE  ·  SCROLL TO ZOOM';
    wrap.appendChild(hint);

    // ── Camera — corner isometric start position ──────────
    // Starts looking into the corner so user sees two walls + door + floor
    // SW corner start: user immediately sees back wall (door), left wall, and the full floor
    // Low pitch keeps floor tiles and pedestals as the hero subject
    let orbitAngle = -0.72;   // ~SW corner, slightly left to frame door nicely
    let targetAngle = -0.72;
    let orbitPitch = 0.26;    // ~15° — low enough to see tile grid & pedestals clearly
    let targetPitch = 0.26;
    let zoomR = 7.0, targetZoom = 7.0;
    let isDragging=false, prevX=0, prevY=0;
    let autoOrbit = true;

    const camTarget = new THREE.Vector3(0, yFinished * 0.5 + 0.4, 0);

    const updateCam = () => {
        camera.position.x = Math.sin(orbitAngle) * zoomR;
        camera.position.z = Math.cos(orbitAngle) * zoomR;
        camera.position.y = camTarget.y + orbitPitch * zoomR * 1.4;
        camera.lookAt(camTarget);
    };

    const onD=e=>{
        isDragging=true; autoOrbit=false;
        prevX=e.clientX||e.touches?.[0]?.clientX||0;
        prevY=e.clientY||e.touches?.[0]?.clientY||0;
    };
    const onM=e=>{
        if(!isDragging)return;
        const cx=e.clientX||e.touches?.[0]?.clientX||0;
        const cy=e.clientY||e.touches?.[0]?.clientY||0;
        targetAngle+=(cx-prevX)*0.006;
        targetPitch-=(cy-prevY)*0.004;
        targetPitch=Math.max(0.06,Math.min(0.80,targetPitch));
        prevX=cx; prevY=cy;
    };
    const onU=()=>{isDragging=false;};
    const onW=e=>{
        e.preventDefault();
        targetZoom=Math.max(1.5,Math.min(13,targetZoom+e.deltaY*0.012));
    };
    wrap.addEventListener('mousedown',  onD);
    wrap.addEventListener('mousemove',  onM);
    wrap.addEventListener('mouseup',    onU);
    wrap.addEventListener('mouseleave', onU);
    wrap.addEventListener('touchstart', onD,{passive:true});
    wrap.addEventListener('touchmove',  onM,{passive:true});
    wrap.addEventListener('touchend',   onU);
    wrap.addEventListener('wheel',      onW,{passive:false});
    _modal.cleanups.push(()=>{
        wrap.removeEventListener('mousedown',  onD);
        wrap.removeEventListener('mousemove',  onM);
        wrap.removeEventListener('mouseup',    onU);
        wrap.removeEventListener('mouseleave', onU);
        wrap.removeEventListener('wheel',      onW);
    });

    const tick2=()=>{
        _modal.rafId=requestAnimationFrame(tick2);
        if(autoOrbit) targetAngle+=0.003;
        orbitAngle+=(targetAngle-orbitAngle)*0.05;
        orbitPitch+=(targetPitch-orbitPitch)*0.05;
        zoomR+=(targetZoom-zoomR)*0.08;
        updateCam();
        renderer.render(scene,camera);
    };
    tick2();
}

// ── Shared helpers ───────────────────────────────────────
function _makeFallbackCanvas(prod) {
    const cv=document.createElement('canvas'); cv.width=cv.height=512;
    const ctx=cv.getContext('2d');
    const gr=ctx.createLinearGradient(0,0,512,512);
    gr.addColorStop(0,prod.isWinner?'#0d2b1e':'#0d1a2e'); gr.addColorStop(1,'#060d1a');
    ctx.fillStyle=gr; ctx.fillRect(0,0,512,512);
    ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=1;
    for(let i=0;i<512;i+=48){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,512);ctx.stroke();}
    for(let j=0;j<512;j+=48){ctx.beginPath();ctx.moveTo(0,j);ctx.lineTo(512,j);ctx.stroke();}
    ctx.fillStyle='rgba(255,255,255,0.18)';
    ctx.font='bold 52px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(prod.name||'',256,240);
    ctx.font='32px monospace';
    ctx.fillStyle=prod.isWinner?'rgba(0,217,139,0.5)':'rgba(59,127,245,0.4)';
    ctx.fillText((prod.gwp||0).toFixed(2)+' kg CO₂e/m²',256,308);
    return cv;
}
function _makeFallbackTexture(prod) { return new THREE.CanvasTexture(_makeFallbackCanvas(prod)); }

// ── Close ────────────────────────────────────────────────
window.closeModal3D = function() {
    const overlay=document.getElementById('modal-3d-overlay');
    if(overlay) overlay.classList.remove('open');
    document.body.style.overflow='';
    _stopModal();
    _modalProd=null;
};
document.addEventListener('DOMContentLoaded',()=>{
    const ov=document.getElementById('modal-3d-overlay');
    if(ov) ov.addEventListener('click',e=>{ if(e.target===ov) closeModal3D(); });
});
