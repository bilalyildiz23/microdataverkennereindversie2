const state = {
  activeView: "guideView",
  search: "",
  guideSearch: "",
  catalogSearchSource: null,
  domains: new Set(),
  knownPeriod: false,
  recent: false,
  longPeriod: false,
  sort: "relevance",
  guideLimit: null,
  selectedVariable: null,
  variableSearch: "",
  variableLimit: 80,
  variableDatasetId: null,
  compareIds: [],
  compareFocusIds: [],
  selectedLimit: 5,
  selectionTouched: false,
  selectionDockCollapsed: false,
  selectedId: datasets[0].id
};

const datasetById = new Map(datasets.map((dataset) => [dataset.id, dataset]));
const datasetVariablesCache = new Map();
const variableDatasetIndex = new Map();
const datasetSearchIndex = new Map();
const searchProfileCache = new Map();
const relevanceScoreCache = new Map();
const MAX_QUERY_CACHE_SIZE = 25;

const els = {
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  guideInput: document.querySelector("#guideInput"),
  guideSearchButton: document.querySelector("#guideSearchButton"),
  resetGuideSearch: document.querySelector("#resetGuideSearch"),
  starterCards: document.querySelectorAll(".starter-card"),
  guideStageQuestion: document.querySelector("#guideStageQuestion"),
  guideStageCompass: document.querySelector("#guideStageCompass"),
  guideStageResults: document.querySelector("#guideStageResults"),
  guideSummary: document.querySelector("#guideSummary"),
  questionCompass: document.querySelector("#questionCompass"),
  guideResultList: document.querySelector("#guideResultList"),
  guideResultControls: document.querySelector("#guideResultControls"),
  openCatalogFromGuide: document.querySelector("#openCatalogFromGuide"),
  searchInput: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  transferredSearchNotice: document.querySelector("#transferredSearchNotice"),
  transferredSearchQuery: document.querySelector("#transferredSearchQuery"),
  clearTransferredSearch: document.querySelector("#clearTransferredSearch"),
  suggestions: document.querySelector("#suggestions"),
  domainTreemap: document.querySelector("#domainTreemap"),
  wordCloud: document.querySelector("#wordCloud"),
  insightContext: document.querySelector("#insightContext"),
  resetExploreContext: document.querySelector("#resetExploreContext"),
  termBars: document.querySelector("#termBars"),
  relatedDatasets: document.querySelector("#relatedDatasets"),
  comparePanel: document.querySelector("#comparePanel"),
  selectionDock: document.querySelector("#selectionDock"),
  domainFilters: document.querySelector("#domainFilters"),
  domainFilterCount: document.querySelector("#domainFilterCount"),
  datasetList: document.querySelector("#datasetList"),
  detailPanel: document.querySelector("#detailPanel"),
  resultCount: document.querySelector("#resultCount"),
  activeSummary: document.querySelector("#activeSummary"),
  resetFilters: document.querySelector("#resetFilters"),
  knownPeriodFilter: document.querySelector("#knownPeriodFilter"),
  recentFilter: document.querySelector("#recentFilter"),
  longPeriodFilter: document.querySelector("#longPeriodFilter"),
  sortSelect: document.querySelector("#sortSelect")
};

function init() {
  buildDataIndexes();
  renderDomainFilters();
  bindEvents();
  renderSuggestions();
  renderGuideResults();
  render();
}

function buildDataIndexes() {
  datasets.forEach((dataset) => {
    const variables = createDatasetVariables(dataset);
    datasetVariablesCache.set(dataset.id, variables);
    datasetSearchIndex.set(dataset.id, createDatasetSearchDocument(dataset, variables));

    variables.forEach((variable) => {
      const key = normalizeVariableName(variable);
      const occurrences = variableDatasetIndex.get(key) || [];
      occurrences.push(dataset);
      variableDatasetIndex.set(key, occurrences);
    });
  });

  variableDatasetIndex.forEach((occurrences) => {
    occurrences.sort((a, b) => a.title.localeCompare(b.title, "nl"));
  });
}

function renderDomainFilters() {
  const domains = [...new Set(datasets.map((dataset) => dataset.domain))].sort();
  const domainCounts = datasets.reduce((counts, dataset) => {
    counts.set(dataset.domain, (counts.get(dataset.domain) || 0) + 1);
    return counts;
  }, new Map());

  if (els.domainFilterCount) {
    els.domainFilterCount.textContent = `${domains.length} domeinen`;
  }

  els.domainFilters.innerHTML = domains
    .map(
      (domain) => `
        <label class="check-row domain-row">
          <input type="checkbox" value="${domain}" class="domain-filter" />
          <span class="filter-label">${domain}</span>
          <span class="filter-count">${domainCounts.get(domain) || 0}</span>
        </label>
      `
    )
    .join("");
}

function bindEvents() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  els.guideSearchButton.addEventListener("click", () => {
    applyGuideSearch(els.guideInput.value);
  });

  els.resetGuideSearch.addEventListener("click", () => {
    state.guideSearch = "";
    state.guideLimit = null;
    els.guideInput.value = "";
    if (state.catalogSearchSource === "guide") {
      state.search = "";
      state.catalogSearchSource = null;
      els.searchInput.value = "";
      renderSuggestions();
    }
    state.selectedId = datasets[0].id;
    state.selectionTouched = false;
    renderGuideResults();
    render();
    els.guideInput.focus();
  });

  els.guideInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      applyGuideSearch(els.guideInput.value);
    }
  });

  els.starterCards.forEach((card) => {
    card.addEventListener("click", () => {
      els.guideInput.value = card.dataset.question;
      applyGuideSearch(card.dataset.question);
    });
  });

  els.openCatalogFromGuide.addEventListener("click", () => {
    state.search = state.guideSearch;
    state.catalogSearchSource = "guide";
    els.searchInput.value = state.search;
    renderSuggestions();
    switchView("catalogView");
  });

  els.resetExploreContext.addEventListener("click", () => {
    state.selectedId = getFilteredDatasets()[0]?.id || datasets[0].id;
    state.selectedVariable = null;
    state.variableSearch = "";
    state.variableLimit = 80;
    state.selectionTouched = true;
    render();
  });

  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    state.catalogSearchSource = null;
    renderSuggestions();
    render();
  });

  els.clearSearch.addEventListener("click", () => {
    clearCatalogSearch();
  });

  els.clearTransferredSearch.addEventListener("click", clearCatalogSearch);

  document.querySelectorAll(".domain-filter").forEach((input) => {
    input.addEventListener("change", (event) => toggleSet(state.domains, event.target.value, event.target.checked));
  });

  els.knownPeriodFilter.addEventListener("change", (event) => {
    state.knownPeriod = event.target.checked;
    render();
  });

  els.recentFilter.addEventListener("change", (event) => {
    state.recent = event.target.checked;
    render();
  });

  els.longPeriodFilter.addEventListener("change", (event) => {
    state.longPeriod = event.target.checked;
    render();
  });

  els.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });

  els.resetFilters.addEventListener("click", resetFilters);
}

function switchView(viewId) {
  state.activeView = viewId;
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewId));
  els.views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  render();
}

function applyGuideSearch(value) {
  state.guideSearch = value.trim();
  state.guideLimit = null;
  state.search = state.guideSearch;
  state.catalogSearchSource = state.guideSearch ? "guide" : null;
  els.searchInput.value = state.guideSearch;
  renderSuggestions();
  renderGuideResults();
  render();
}

function clearCatalogSearch() {
  state.search = "";
  state.catalogSearchSource = null;
  els.searchInput.value = "";
  renderSuggestions();
  render();
  els.searchInput.focus();
}

function toggleSet(set, value, enabled) {
  if (enabled) {
    set.add(value);
  } else {
    set.delete(value);
  }
  render();
}

function resetFilters() {
  state.search = "";
  state.catalogSearchSource = null;
  state.domains.clear();
  state.knownPeriod = false;
  state.recent = false;
  state.longPeriod = false;
  state.sort = "relevance";

  els.searchInput.value = "";
  els.sortSelect.value = "relevance";
  document.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = false;
  });

  renderSuggestions();
  render();
}

function renderSuggestions() {
  const query = state.search;
  const uniqueOptions = query ? getCatalogSuggestions(query) : starterQuestions;

  if (!query) {
    els.suggestions.innerHTML = `
      <details class="example-panel catalog-examples">
        <summary>Voorbeeldzoekvragen tonen</summary>
        <div class="catalog-example-list">
          ${uniqueOptions.map((suggestion) => `<button type="button" class="suggestion">${suggestion}</button>`).join("")}
        </div>
      </details>
    `;
  } else {
    els.suggestions.innerHTML = uniqueOptions
      .map((suggestion) => `<button type="button" class="suggestion">${suggestion}</button>`)
      .join("");
  }

  els.suggestions.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("click", () => {
      state.search = button.textContent;
      state.catalogSearchSource = null;
      els.searchInput.value = button.textContent;
      renderSuggestions();
      render();
    });
  });
}

function renderInsights() {
  const selectedDataset = datasetById.get(state.selectedId);
  if (!selectedDataset) {
    els.insightContext.textContent = "Selecteer eerst een dataset in de catalogus.";
    els.domainTreemap.innerHTML = `<div class="empty-state"><p>Geen dataset geselecteerd.</p></div>`;
    els.wordCloud.innerHTML = `<div class="empty-state"><p>Geen variabelen beschikbaar.</p></div>`;
    els.termBars.innerHTML = `<div class="empty-state"><p>Geen periode beschikbaar.</p></div>`;
    els.relatedDatasets.innerHTML = `<div class="empty-state"><p>Kies eerst een variabele.</p></div>`;
    return;
  }

  if (state.variableDatasetId !== selectedDataset.id) {
    state.variableDatasetId = selectedDataset.id;
    state.variableSearch = "";
    state.variableLimit = 80;
  }

  const variables = getDatasetVariables(selectedDataset);
  if (state.selectedVariable && !variables.includes(state.selectedVariable)) {
    state.selectedVariable = null;
  }
  if (!state.selectedVariable && variables.length) {
    state.selectedVariable = variables[0];
  }

  els.insightContext.textContent = `Geselecteerd: ${selectedDataset.title} - ${selectedDataset.subtitle}.`;
  renderDatasetSummaryTiles(selectedDataset, variables);
  renderVariableCloud(selectedDataset, variables);
  renderYearOverview(selectedDataset);
  renderVariableOccurrences(selectedDataset, variables);
}

function getDatasetVariables(dataset) {
  const cached = datasetVariablesCache.get(dataset.id);
  if (cached) return cached;

  const variables = createDatasetVariables(dataset);
  datasetVariablesCache.set(dataset.id, variables);
  return variables;
}

function createDatasetVariables(dataset) {
  const variables = Array.isArray(dataset.pdfVariables) && dataset.pdfVariables.length
    ? dataset.pdfVariables
    : [];
  const uniqueVariables = new Map();

  variables
    .map((variable) => String(variable).trim())
    .filter(Boolean)
    .forEach((variable) => {
      const key = normalizeVariableName(variable);
      const current = uniqueVariables.get(key);
      uniqueVariables.set(key, getPreferredVariableLabel(current, variable));
    });

  return [...uniqueVariables.values()];
}

function renderDatasetSummaryTiles(dataset, variables) {
  const variableCount = variables.length || dataset.pdfVariableCount || "Onbekend";
  const shownVariables = variables.length ? variables.length : 0;

  els.domainTreemap.innerHTML = `
    <div class="summary-tile">
      <span>Variabelen in PDF</span>
      <strong>${variableCount}</strong>
      <small>${shownVariables ? `${shownVariables} namen gevonden` : "Geen namen uit PDF gelezen"}</small>
    </div>
    <div class="summary-tile">
      <span>Beschikbare periode</span>
      <strong>${dataset.years}</strong>
      <small>Volgens CBS-overzicht/testset</small>
    </div>
    <div class="summary-tile">
      <span>Domein</span>
      <strong>${dataset.domain}</strong>
      <small>${dataset.title}</small>
    </div>
  `;
}

function renderVariableCloud(dataset, variables) {
  if (!variables.length) {
    els.wordCloud.innerHTML = `
      <div class="empty-state">
        <p>Voor dit bestand zijn nog geen variabelen uit de PDF gelezen.</p>
      </div>
    `;
    return;
  }

  const normalizedQuery = normalizeSearchText(state.variableSearch);
  const filteredVariables = normalizedQuery
    ? variables.filter((variable) => normalizeSearchText(variable).includes(normalizedQuery))
    : variables;
  const visibleVariables = filteredVariables.slice(0, state.variableLimit);

  els.wordCloud.innerHTML = `
    <div class="variable-browser">
      <div class="variable-toolbar">
        <label for="variableSearchInput">
          <span>Zoek binnen ${variables.length} variabelen</span>
          <input
            id="variableSearchInput"
            type="search"
            placeholder="Bijvoorbeeld: inkomen, gemeente of RINPERSOON"
            autocomplete="off"
          />
        </label>
        <span class="variable-count">${filteredVariables.length} gevonden</span>
      </div>
      ${
        visibleVariables.length
          ? `<div class="variable-chip-list">
              ${visibleVariables
                .map((variable, index) => {
      const occurrenceCount = getVariableOccurrences(variable, dataset.id).length;
      const selectedClass = state.selectedVariable === variable ? "selected" : "";
      return `
        <button type="button" class="term variable-chip ${selectedClass}" data-variable-index="${index}" title="${occurrenceCount} andere bestanden">
          ${variable}
        </button>
      `;
                })
                .join("")}
            </div>`
          : `<div class="empty-state compact"><p>Geen variabelen gevonden voor deze zoekterm.</p></div>`
      }
      ${
        filteredVariables.length > visibleVariables.length
          ? `<button type="button" id="showMoreVariables" class="show-more-variables">
              Toon nog ${Math.min(80, filteredVariables.length - visibleVariables.length)}
            </button>`
          : ""
      }
    </div>
  `;

  const variableSearchInput = document.querySelector("#variableSearchInput");
  if (variableSearchInput) variableSearchInput.value = state.variableSearch;
  variableSearchInput?.addEventListener("input", (event) => {
    state.variableSearch = event.target.value;
    state.variableLimit = 80;
    renderVariableCloud(dataset, variables);
    const refreshedInput = document.querySelector("#variableSearchInput");
    if (refreshedInput) {
      refreshedInput.focus();
      refreshedInput.setSelectionRange(state.variableSearch.length, state.variableSearch.length);
    }
  });

  els.wordCloud.querySelectorAll(".variable-chip").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedVariable = visibleVariables[Number(button.dataset.variableIndex)];
      renderInsights();
    });
  });

  document.querySelector("#showMoreVariables")?.addEventListener("click", () => {
    state.variableLimit += 80;
    renderVariableCloud(dataset, variables);
  });
}

function renderYearOverview(dataset) {
  const years = [...new Set((dataset.years.match(/\d{4}/g) || []).map(Number))]
    .filter((year) => year >= 1900 && year <= 2100)
    .sort((a, b) => a - b);

  if (!years.length) {
    els.termBars.innerHTML = `
      <div class="empty-state">
        <p>Geen duidelijke jaren herkend in: ${dataset.years}.</p>
      </div>
    `;
    return;
  }

  const start = years[0];
  const end = years[years.length - 1];
  const duration = end - start + 1;
  const periodType = getPeriodType(dataset.years);
  const periodUse = getPeriodUseLabel(start, end, duration);
  const width = Math.max(8, Math.min(100, Math.round((duration / Math.max(duration, 30)) * 100)));

  els.termBars.innerHTML = `
    <div class="year-overview">
      <div class="year-range">
        <span>${start}</span>
        <div><i style="width: ${width}%"></i></div>
        <span>${end}</span>
      </div>
      <div class="period-facts">
        <div>
          <span>Start</span>
          <strong>${start}</strong>
        </div>
        <div>
          <span>Eind</span>
          <strong>${end}</strong>
        </div>
        <div>
          <span>Bereik</span>
          <strong>${duration} jaar</strong>
        </div>
        <div>
          <span>Type</span>
          <strong>${periodType}</strong>
        </div>
      </div>
      <p class="period-source">${dataset.years}</p>
      <p class="period-note">${periodUse}</p>
    </div>
  `;
}

function getPeriodType(yearText) {
  const text = String(yearText || "").toLowerCase();
  if (/\d{4}\s*[kq][1-4]|\bk[1-4]\b|\bq[1-4]\b/.test(text)) return "Kwartaal";
  if (/\b\d{6}\b|\b\d{4}\d{2}\b|maand/.test(text)) return "Maand";
  if (/,|\ben\b/.test(text) && !/t\/m|tot en met/.test(text)) return "Losse jaren";
  if (/t\/m|tot en met|-/.test(text)) return "Doorlopende reeks";
  return "Jaar";
}

function getPeriodUseLabel(start, end, duration) {
  const parts = [];
  if (end >= 2023) parts.push("bevat recente jaren");
  if (duration >= 15) parts.push("geschikt voor trendvragen");
  if (duration <= 3) parts.push("vooral geschikt voor recente of afgebakende vragen");
  if (end < 2020) parts.push("let op: geen recente periode in deze testset");
  return parts.length
    ? `Periode-inschatting: ${parts.join(", ")}.`
    : "Periode-inschatting: controleer in de CBS-documentatie of alle tussenliggende jaren beschikbaar zijn.";
}

function renderVariableOccurrences(selectedDataset, variables) {
  if (!variables.length) {
    els.relatedDatasets.innerHTML = `<div class="empty-state"><p>Geen PDF-variabelen beschikbaar voor deze selectie.</p></div>`;
    return;
  }

  const selectedVariable = state.selectedVariable || variables[0];
  const occurrences = getVariableOccurrences(selectedVariable, selectedDataset.id);

  els.relatedDatasets.innerHTML = `
    <div class="selected-variable">
      <span>Geselecteerde variabele</span>
      <strong>${selectedVariable}</strong>
    </div>
    ${
      occurrences.length
        ? occurrences
            .slice(0, 8)
            .map(
              (dataset) => `
                <button type="button" class="related-item" data-id="${dataset.id}">
                  <span>${dataset.domain}</span>
                  <strong>${dataset.title}</strong>
                  <small>${dataset.subtitle}</small>
                </button>
              `
            )
            .join("")
        : `<div class="empty-state"><p>Deze variabele is in de testset niet in andere bestanden gevonden.</p></div>`
    }
  `;

  els.relatedDatasets.querySelectorAll(".related-item").forEach((button) => {
    button.addEventListener("click", () => {
      openDatasetInCatalog(button.dataset.id);
    });
  });
}

function getVariableOccurrences(variable, currentDatasetId) {
  const target = normalizeVariableName(variable);
  return (variableDatasetIndex.get(target) || []).filter((dataset) => dataset.id !== currentDatasetId);
}

function getTopTerms(sourceDatasets, limit) {
  const stopWords = new Set([
    "voor",
    "van",
    "met",
    "een",
    "het",
    "zijn",
    "over",
    "naar",
    "deze",
    "bestand",
    "bestanden",
    "kenmerken",
    "gegevens",
    "personen",
    "microdatabestand",
    "catalogusrecord",
    "raadpleeg",
    "volledige",
    "documentatie",
    "binnen",
    "domein",
    "beschikbaar",
    "beschikbare",
    "microdata",
    "metadata",
    "pdf",
    "cbs",
    "dataset",
    "datasets",
    "data",
    "pagina",
    "prototype",
    "bron",
    "open",
    "klik",
    "altijd",
    "idk",
    "tabel",
    "bus",
    "tab",
    "record",
    "records",
    "variabele",
    "variabelen",
    "toelichting"
  ]);

  const termCounts = new Map();
  sourceDatasets.forEach((dataset) => {
    getKeywordText(dataset)
      .toLowerCase()
      .split(/[^a-z0-9\u00c0-\u00ff-]+/i)
      .map((term) => normalizeTerm(term))
      .filter((term) => term.length > 3 && !stopWords.has(term) && !/^\d+$/.test(term))
      .forEach((term) => termCounts.set(term, (termCounts.get(term) || 0) + 1));
  });

  return [...termCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function getKeywordText(dataset) {
  const parts = [
    dataset.title,
    dataset.subtitle,
    dataset.domain,
    dataset.bestandsonderwerp || "",
    dataset.description || "",
    dataset.themes.join(" "),
    dataset.pdfDescription || "",
    dataset.pdfSummary || "",
    dataset.pdfPopulation || "",
    (dataset.pdfVariables || dataset.variables || []).join(" ")
  ];

  return parts.join(" ");
}

function normalizeTerm(term) {
  return term
    .replace(/^(cbs|microdata|metadata)-?/i, "")
    .replace(/(bus|tab)$/i, "")
    .trim();
}

function renderTermBars(terms, maxTermCount) {
  els.termBars.innerHTML =
    terms
      .map(([term, count]) => {
        const width = Math.max(12, Math.round((count / maxTermCount) * 100));
        return `
          <button type="button" class="term-bar" data-term="${term}">
            <span>${term}</span>
            <div><i style="width: ${width}%"></i></div>
            <strong>${count}</strong>
          </button>
        `;
      })
      .join("") || `<div class="empty-state"><p>Geen termverdeling beschikbaar.</p></div>`;

  els.termBars.querySelectorAll(".term-bar").forEach((button) => {
    button.addEventListener("click", () => {
      state.search = button.dataset.term;
      els.searchInput.value = button.dataset.term;
      renderSuggestions();
      switchView("catalogView");
    });
  });
}

function renderRelatedDatasets(selectedDataset, contextDatasets) {
  if (!selectedDataset) {
    els.relatedDatasets.innerHTML = `<div class="empty-state"><p>Selecteer eerst een dataset in de catalogus.</p></div>`;
    return;
  }

  const related = contextDatasets
    .filter((dataset) => dataset.id !== selectedDataset.id)
    .map((dataset) => ({ ...dataset, relationScore: getRelationScore(selectedDataset, dataset) }))
    .filter((dataset) => dataset.relationScore > 0)
    .sort((a, b) => b.relationScore - a.relationScore || a.title.localeCompare(b.title, "nl"))
    .slice(0, 6);

  els.relatedDatasets.innerHTML =
    related
      .map(
        (dataset) => `
          <button type="button" class="related-item" data-id="${dataset.id}">
            <span>${dataset.domain}</span>
            <strong>${dataset.title}</strong>
            <small>${dataset.subtitle}</small>
          </button>
        `
      )
      .join("") || `<div class="empty-state"><p>Geen gerelateerde datasets gevonden binnen deze selectie.</p></div>`;

  els.relatedDatasets.querySelectorAll(".related-item").forEach((button) => {
    button.addEventListener("click", () => {
      openDatasetInCatalog(button.dataset.id);
    });
  });
}

function openDatasetInCatalog(datasetId) {
  state.search = "";
  state.domains.clear();
  state.knownPeriod = false;
  state.recent = false;
  state.longPeriod = false;
  state.sort = "relevance";
  state.selectedId = datasetId;
  state.selectedVariable = null;
  state.variableSearch = "";
  state.variableLimit = 80;
  state.selectionTouched = true;

  els.searchInput.value = "";
  els.sortSelect.value = "relevance";
  document.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = false;
  });

  renderSuggestions();
  switchView("catalogView");
}

function selectDatasetFromDock(datasetId) {
  state.search = "";
  state.domains.clear();
  state.knownPeriod = false;
  state.recent = false;
  state.longPeriod = false;
  state.sort = "relevance";
  state.selectedId = datasetId;
  state.selectedVariable = null;
  state.variableSearch = "";
  state.variableLimit = 80;
  state.selectionTouched = true;

  els.searchInput.value = "";
  els.sortSelect.value = "relevance";
  document.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = false;
  });

  renderSuggestions();
  render();
}

function renderCompare() {
  if (!els.comparePanel) return;

  const chosen = state.compareIds
    .map((id) => datasetById.get(id))
    .filter(Boolean);
  const selected = getCompareFocusDatasets(chosen);
  const comparison = getComparisonSummary(selected);

  els.comparePanel.innerHTML = `
    <section class="compare-header">
      <div>
        <p class="eyebrow">Op basis van geselecteerde bestanden</p>
        <h2>Vergelijken</h2>
        <p>Kies twee of drie bestanden en controleer de belangrijkste verschillen in de matrix.</p>
      </div>
      <button type="button" id="clearCompareList" ${chosen.length ? "" : "disabled"}>Wis selectie</button>
    </section>
    ${
      chosen.length
        ? `
          ${renderCompareSelector(chosen, selected)}
          ${
            selected.length
              ? `
          ${renderCompareMatrix(selected, comparison)}
          ${
            selected.length < 2
              ? `<div class="compare-note">Kies nog een tweede bestand om te vergelijken.</div>`
              : ""
          }
          ${renderVariableComparison(selected, comparison)}
              `
              : `<div class="compare-note">Kies minimaal twee bestanden.</div>`
          }
        `
        : `<div class="empty-state">
            <h3>Nog geen bestanden geselecteerd</h3>
            <p>Ga naar de catalogus en voeg twee of drie bestanden toe aan Geselecteerde bestanden.</p>
          </div>`
    }
  `;

  document.querySelector("#clearCompareList")?.addEventListener("click", () => {
    state.compareIds = [];
    state.compareFocusIds = [];
    render();
  });

  els.comparePanel.querySelectorAll(".compare-slot-select").forEach((select) => {
    select.addEventListener("change", () => {
      const slot = Number(select.dataset.slot);
      state.compareFocusIds[slot] = select.value;
      render();
    });
  });

  els.comparePanel.querySelectorAll(".variable-dataset-link").forEach((button) => {
    button.addEventListener("click", () => selectDatasetFromDock(button.dataset.id));
  });
}

function getCompareFocusDatasets(chosen) {
  const validIds = new Set(chosen.map((dataset) => dataset.id));
  const cleanedFocusIds = [0, 1, 2].map((slot) => {
    const id = state.compareFocusIds[slot] || "";
    return validIds.has(id) ? id : "";
  });

  state.compareFocusIds = cleanedFocusIds;

  if (!state.compareFocusIds.some(Boolean) && chosen.length) {
    state.compareFocusIds = [
      chosen[0]?.id || "",
      chosen[1]?.id || "",
      ""
    ];
  }

  const seen = new Set();
  state.compareFocusIds = [0, 1, 2].map((slot) => {
    const id = state.compareFocusIds[slot] || "";
    if (!id || seen.has(id)) return "";
    seen.add(id);
    return id;
  });

  return state.compareFocusIds
    .filter(Boolean)
    .map((id) => chosen.find((dataset) => dataset.id === id))
    .filter(Boolean);
}

function renderCompareSelector(chosen, selected) {
  const selectedIds = state.compareFocusIds.slice(0, 3);
  return `
    <section class="compare-selector">
      <div>
        <h3>Kies 2 of 3 bestanden</h3>
        <p>Gebruik de geselecteerde bestanden uit de catalogus.</p>
      </div>
      <div class="compare-slot-list">
        ${[0, 1, 2]
          .map((slot) => renderCompareSlot(slot, chosen, selectedIds))
          .join("")}
      </div>
    </section>
  `;
}

function renderCompareSlot(slot, chosen, selectedIds) {
  const currentId = selectedIds[slot] || "";
  return `
    <label class="compare-slot">
      <span>${slot === 2 ? "Bestand 3 (optioneel)" : `Bestand ${slot + 1}`}</span>
      <select class="compare-slot-select" data-slot="${slot}">
        <option value="">Niet gebruiken</option>
        ${chosen
          .map((dataset) => {
            const alreadySelected = selectedIds.includes(dataset.id) && dataset.id !== currentId;
            return `
              <option value="${dataset.id}" ${dataset.id === currentId ? "selected" : ""} ${alreadySelected ? "disabled" : ""}>
                ${dataset.title} - ${dataset.domain} - ${dataset.bestandsonderwerp || "geen onderwerp gekoppeld"}
              </option>
            `;
          })
          .join("")}
      </select>
    </label>
  `;
}

function getComparisonSummary(selected) {
  const knownRanges = selected
    .map((dataset) => getYearRange(dataset))
    .filter((range) => range.start && range.end);
  const overlapStart = knownRanges.length ? Math.max(...knownRanges.map((range) => range.start)) : 0;
  const overlapEnd = knownRanges.length ? Math.min(...knownRanges.map((range) => range.end)) : 0;
  const hasFullOverlap = selected.length > 1 && knownRanges.length === selected.length && overlapStart <= overlapEnd;

  const variableSets = selected.map((dataset) => ({
    id: dataset.id,
    variables: getDatasetVariables(dataset),
    normalized: new Map(getDatasetVariables(dataset).map((variable) => [normalizeVariableName(variable), variable]))
  }));
  const commonVariableKeys = variableSets.length
    ? [...variableSets[0].normalized.keys()].filter((key) => variableSets.every((set) => set.normalized.has(key)))
    : [];
  const commonVariables = commonVariableKeys.map((key) => variableSets[0].normalized.get(key));
  const variableFrequency = new Map();
  variableSets.forEach((set) => {
    set.normalized.forEach((variable, key) => {
      const dataset = datasetById.get(set.id);
      const current = variableFrequency.get(key) || { label: variable, count: 0, datasets: [] };
      current.count += 1;
      if (dataset) {
        current.datasets.push({
          id: dataset.id,
          title: dataset.title,
          subject: getDatasetSubject(dataset)
        });
      }
      variableFrequency.set(key, current);
    });
  });
  const sharedVariables = [...variableFrequency.values()]
    .filter((item) => item.count > 1)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "nl"));
  const uniqueVariablesById = new Map();
  variableSets.forEach((set) => {
    const unique = [...set.normalized.entries()]
      .filter(([key]) => (variableFrequency.get(key)?.count || 0) === 1)
      .map(([, variable]) => variable)
      .sort((a, b) => a.localeCompare(b, "nl"));
    uniqueVariablesById.set(set.id, unique);
  });

  const populations = selected.map((dataset) => normalizeCompareText(getComparePopulation(dataset))).filter(Boolean);
  const populationKinds = new Set(populations);
  const subjects = selected.map((dataset) => normalizeCompareText(getDatasetSubject(dataset))).filter(Boolean);
  const subjectKinds = new Set(subjects);
  const domains = new Set(selected.map((dataset) => dataset.domain));
  const domainList = [...domains];

  return {
    domainStatus: domains.size <= 1 ? domainList[0] || "Nog geen selectie" : `${domains.size} domeinen`,
    domainDetail: selected.length > 1
      ? domains.size <= 1
        ? "Alle vergelijkbestanden vallen binnen hetzelfde CBS-domein."
        : `Je vergelijkt over domeinen heen: ${domainList.join(", ")}.`
      : "Kies een tweede bestand om domeinen naast elkaar te leggen.",
    yearsStatus: hasFullOverlap ? `${overlapStart} t/m ${overlapEnd}` : selected.length > 1 ? "Geen volledige overlap" : selected[0]?.years || "Nog geen selectie",
    yearsDetail: knownRanges.length === selected.length
      ? hasFullOverlap
        ? "Alle geselecteerde bestanden hebben in deze periode jaren gemeenschappelijk."
        : "De geselecteerde bestanden hebben geen periode die bij allemaal overlapt."
      : "Niet voor elk geselecteerd bestand is de periode duidelijk uitgelezen.",
    variablesStatus: commonVariables.length
      ? `${commonVariables.length} in alle bestanden`
      : sharedVariables.length
        ? `${sharedVariables.length} deels gedeeld`
        : selected.length > 1
          ? "Geen overlap"
          : `${variableSets[0]?.variables.length || 0} variabelen`,
    variablesDetail: selected.length > 1
      ? `${sharedVariables.length} variabele(n) komen in minimaal twee geselecteerde bestanden voor.`
      : "Kies een tweede bestand om overlap te zien.",
    populationStatus: populationKinds.size <= 1 && populations.length === selected.length ? "Lijkt gelijk" : "Verschilt of onbekend",
    populationDetail: populations.length === selected.length
      ? populationKinds.size <= 1
        ? "De uitgelezen populatietekst lijkt hetzelfde."
        : "De uitgelezen populatieteksten verschillen."
      : "Niet bij elk bestand is populatie uit de PDF uitgelezen.",
    subjectStatus: subjectKinds.size <= 1 ? "Zelfde onderwerp" : "Meerdere onderwerpen",
    subjectDetail: subjectKinds.size <= 1
      ? "Het gekoppelde CBS-bestandsonderwerp lijkt hetzelfde."
      : `Er zijn ${subjectKinds.size} bestandsonderwerpen in deze vergelijking.`,
    commonVariables,
    sharedVariables,
    variableFrequency,
    yearOverlap: hasFullOverlap ? `${overlapStart} t/m ${overlapEnd}` : "",
    uniqueVariablesById
  };
}

function renderCompareMetric(label, value, detail) {
  return `
    <article class="compare-metric">
      <span>${label}</span>
      <strong>${value}</strong>
      <p>${detail}</p>
    </article>
  `;
}

function renderCompareMatrix(selected, comparison) {
  if (!selected.length) return "";

  const rows = getCompareMatrixRows(selected, comparison);
  return `
    <section class="compare-matrix-section">
      <div class="compare-section-heading">
        <h3>Beslismatrix</h3>
        <p>Snelle check om te zien waar bestanden inhoudelijk bij elkaar passen en waar je extra moet controleren.</p>
      </div>
      <div class="matrix-legend">
        <span class="legend-match"></span>
        <p><strong>Donkergroen</strong> = exact hetzelfde, bijvoorbeeld hetzelfde domein of exact dezelfde periode.</p>
        <span class="legend-partial"></span>
        <p><strong>Groenblauw</strong> = gedeeltelijke overlap, bijvoorbeeld overlappende jaren of enkele gedeelde variabelen.</p>
      </div>
      <div class="compare-matrix-scroll">
        <table class="compare-matrix">
          <thead>
            <tr>
              <th scope="col">Criterium</th>
              ${selected.map((dataset) => `<th scope="col">${dataset.title}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr>
                    <th scope="row">
                      <span>${row.label}</span>
                      <small>${row.help}</small>
                    </th>
                    ${row.values.map((value) => renderMatrixCell(value)).join("")}
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function getCompareMatrixRows(selected, comparison) {
  const domainFrequency = getFrequencyMap(selected.map((dataset) => dataset.domain));
  const subjectFrequency = getFrequencyMap(selected.map((dataset) => getDatasetSubject(dataset)));
  const populationTexts = selected.map((dataset) => getComparePopulation(dataset));
  const populationTextFrequency = getFrequencyMap(populationTexts);
  const populationCategories = selected.map((dataset) => getPopulationCategory(dataset));
  const populationFrequency = getFrequencyMap(populationCategories.map((item) => item.key).filter(Boolean));
  const yearTones = getYearMatrixTones(selected);
  const variablesByDataset = selected.map((dataset) => getDatasetVariables(dataset));
  const variableFrequency = getVariableFrequencyFromLists(variablesByDataset);
  const variableSetKeys = variablesByDataset.map((variables) => getNormalizedSetKey(variables));
  const sharedVariableByDataset = selected.map((dataset) => {
    const variables = getDatasetVariables(dataset);
    return variables.filter((variable) => (comparison.variableFrequency.get(normalizeVariableName(variable))?.count || 0) > 1);
  });
  const sharedVariableSetKeys = sharedVariableByDataset.map((variables) => getNormalizedSetKey(variables));

  return [
    {
      label: "Domein",
      help: "Past de vergelijking binnen hetzelfde CBS-domein?",
      values: selected.map((dataset) => ({
        text: dataset.domain,
        tone: getExactGroupedCellTone(dataset.domain, domainFrequency)
      }))
    },
    {
      label: "Bestandsonderwerp",
      help: "Belangrijk voor context, toegang en kosten.",
      values: selected.map((dataset) => ({
        text: getDatasetSubject(dataset),
        tone: getExactGroupedCellTone(getDatasetSubject(dataset), subjectFrequency)
      }))
    },
    {
      label: "Beschikbare jaren",
      help: "Kun je dezelfde periode vergelijken?",
      values: selected.map((dataset, index) => ({
        text: dataset.years,
        tone: yearTones[index]
      }))
    },
    {
      label: "Populatie",
      help: "Gaat het over dezelfde soort eenheden/personen?",
      values: selected.map((dataset, index) => ({
        text: shortenCompareText(populationTexts[index], 150),
        tone: getPopulationCellTone(populationTexts[index], populationCategories[index].key, populationTextFrequency, populationFrequency, selected.length)
      }))
    },
    {
      label: "Variabelen uit PDF",
      help: "Hoeveel variabelen zijn uit de metadata-PDF gelezen?",
      values: selected.map((dataset, index) => ({
        text: `${variablesByDataset[index].length || "Onbekend"} variabelen${sharedVariableByDataset[index].length ? ` (${sharedVariableByDataset[index].length} gedeeld)` : ""}`,
        tone: getSetCellTone(variablesByDataset[index], variableSetKeys[index], variableSetKeys, variableFrequency)
      }))
    },
    {
      label: "Alle variabelen",
      help: "Alle uitgelezen variabelen per bestand. Deze lijst komt uit de metadata-PDF.",
      values: variablesByDataset.map((variables, index) => ({
        text: renderFullMatrixList(variables, "Geen variabelen uitgelezen"),
        tone: getSetCellTone(variables, variableSetKeys[index], variableSetKeys, variableFrequency)
      }))
    },
    {
      label: "Gedeelde variabelen",
      help: "Variabelen die ook in een ander geselecteerd bestand voorkomen. Mogelijke koppelvelden zoals BE_ID of RINPERSOON vallen hier ook onder.",
      values: sharedVariableByDataset.map((variables) => ({
        text: renderMatrixList(variables, "Geen gedeelde variabelen"),
        tone: getSetCellTone(variables, getNormalizedSetKey(variables), sharedVariableSetKeys, comparison.variableFrequency)
      }))
    }
  ];
}

function renderMatrixCell(value) {
  if (typeof value === "string") return `<td>${value}</td>`;
  const toneClass = value.tone ? ` matrix-cell-${value.tone}` : "";
  return `<td class="${toneClass.trim()}">${value.text}</td>`;
}

function getFrequencyMap(values) {
  return values.reduce((map, value) => {
    const key = normalizeCompareText(value);
    if (!key || key.includes("niet uitgelezen") || key.includes("controleer in metadata")) return map;
    const current = map.get(key) || { count: 0, label: value };
    current.count += 1;
    map.set(key, current);
    return map;
  }, new Map());
}

function getExactGroupedCellTone(value, frequencyMap) {
  const key = normalizeCompareText(value);
  const count = frequencyMap.get(key)?.count || 0;
  if (count > 1) return "match";
  return "";
}

function getPopulationCellTone(populationText, categoryKey, populationTextFrequency, populationFrequency, totalCount) {
  if (getExactGroupedCellTone(populationText, populationTextFrequency)) return "match";
  const categoryKeyNormalized = normalizeCompareText(categoryKey);
  if (categoryKeyNormalized && (populationFrequency.get(categoryKeyNormalized)?.count || 0) > 1) return "partial";
  return "";
}

function getYearMatrixTones(selected) {
  const ranges = selected.map((dataset) => getYearRange(dataset));
  return ranges.map((range, index) => {
    if (!range.start || !range.end || selected.length < 2) return "";
    const exactCount = ranges.filter((otherRange) => {
      return otherRange.start === range.start && otherRange.end === range.end;
    }).length;
    if (exactCount > 1) return "match";
    const overlapCount = ranges.filter((otherRange, otherIndex) => {
      if (otherIndex === index || !otherRange.start || !otherRange.end) return false;
      return Math.max(range.start, otherRange.start) <= Math.min(range.end, otherRange.end);
    }).length;
    if (overlapCount > 0) return "partial";
    return "";
  });
}

function getPopulationCategory(dataset) {
  const source = dataset.pdfPopulation || getPopulationHint(dataset);
  const text = normalizeSearchText(`${source} ${dataset.title} ${dataset.subtitle}`);
  const categories = [
    ["huishoudens", ["huishouden", "huishoudens"]],
    ["bedrijven", ["bedrijf", "bedrijven", "bedrijfseenheid", "ondernemer", "werkgever", "zelfstandige", "zzp"]],
    ["werknemers", ["werknemer", "werknemers", "baan", "banen", "polis"]],
    ["uitkeringen", ["uitkering", "uitkeringen", "bijstand", "aow", "anw", "ww", "wia", "wao", "wajong"]],
    ["onderwijs", ["student", "studenten", "leerling", "leerlingen", "scholier", "onderwijsinstelling", "opleiding"]],
    ["zorg", ["zorgproduct", "zorgproducten", "patient", "patiënt", "ziekenhuis", "ggz"]],
    ["personen", ["persoon", "personen", "rinpersoon", "burger", "inwoner", "bevolking"]]
  ];
  const found = categories.find(([, terms]) => terms.some((term) => text.includes(term)));
  return found ? { key: found[0], label: found[0] } : { key: "", label: "onbekend" };
}

function getVariableFrequencyFromLists(itemLists) {
  const frequency = new Map();
  itemLists.forEach((items, datasetIndex) => {
    const seenInDataset = new Set();
    items.forEach((item) => {
      const key = normalizeVariableName(item);
      if (!key || seenInDataset.has(key)) return;
      seenInDataset.add(key);
      const current = frequency.get(key) || { label: item, count: 0, datasets: [] };
      current.count += 1;
      current.datasets.push(datasetIndex);
      frequency.set(key, current);
    });
  });
  return frequency;
}

function getNormalizedSetKey(items) {
  return [...new Set(items.map((item) => normalizeVariableName(item)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "nl"))
    .join("|");
}

function getSetCellTone(items, setKey, allSetKeys, itemFrequency) {
  if (!items.length || !setKey) return "";
  const exactCount = allSetKeys.filter((key) => key && key === setKey).length;
  if (exactCount > 1) return "match";
  const hasPartialOverlap = items.some((item) => (itemFrequency.get(normalizeVariableName(item))?.count || 0) > 1);
  if (hasPartialOverlap) return "partial";
  return "";
}

function renderMatrixList(items, emptyText) {
  if (!items.length) return `<span class="matrix-muted">${emptyText}</span>`;
  const shown = items.slice(0, 5);
  return `
    <span class="matrix-list">
      ${shown.map((item) => `<span>${item}</span>`).join("")}
      ${items.length > shown.length ? `<small>+${items.length - shown.length}</small>` : ""}
    </span>
  `;
}

function renderFullMatrixList(items, emptyText) {
  if (!items.length) return `<span class="matrix-muted">${emptyText}</span>`;
  return `
    <span class="matrix-list matrix-list-full">
      ${items.map((item) => `<span>${item}</span>`).join("")}
    </span>
  `;
}

function getKeyVariables(dataset) {
  const variables = getDatasetVariables(dataset);
  const keyPattern = /(rinpersoon|rinpersoons|be[_-]?id|rinobject|gemeente|postcode|adres|vestiging|baan|huishouden)/i;
  return variables
    .filter((variable) => keyPattern.test(variable))
    .slice(0, 8);
}

function renderVariableComparison(selected, comparison) {
  if (!selected.length) return "";

  return `
    <section class="compare-variables">
      <div class="compare-section-heading">
        <h3>Variabele-overlap</h3>
        <p>Variabelen die in meerdere gekozen bestanden voorkomen.</p>
      </div>
      <div class="compare-variable-columns">
        <div>
          <h4>In alle geselecteerde bestanden</h4>
          ${renderVariableChips(comparison.commonVariables, "Geen variabele komt in alle geselecteerde bestanden voor.")}
        </div>
        <div>
          <h4>In meerdere bestanden</h4>
          ${
            comparison.sharedVariables.length
              ? renderSharedVariableList(comparison.sharedVariables)
              : `<p class="muted-text">Geen gedeeltelijke overlap gevonden.</p>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderSharedVariableList(sharedVariables) {
  return `
    <div class="shared-variable-list">
      ${sharedVariables
        .slice(0, 12)
        .map(
          (item) => `
            <article class="shared-variable-item">
              <div>
                <strong>${item.label}</strong>
                <span>${item.count} bestanden</span>
              </div>
              <div class="shared-variable-files">
                ${item.datasets
                  .map(
                    (dataset) => `
                      <button type="button" class="variable-dataset-link" data-id="${dataset.id}" title="${dataset.subject}">
                        ${dataset.title}
                      </button>
                    `
                  )
                  .join("")}
              </div>
            </article>
          `
        )
        .join("")}
    </div>
    ${
      sharedVariables.length > 12
        ? `<p class="muted-text">Nog ${sharedVariables.length - 12} gedeelde variabelen niet getoond in deze compacte lijst.</p>`
        : ""
    }
  `;
}

function renderVariableChips(variables, emptyText) {
  return variables.length
    ? `<div class="compare-chip-row">${variables.slice(0, 18).map((variable) => `<span>${variable}</span>`).join("")}</div>`
    : `<p class="muted-text">${emptyText}</p>`;
}

function getYearRange(dataset) {
  const matches = (dataset.years.match(/\d{4}/g) || []).map(Number);
  const start = matches.length ? Math.min(...matches) : 0;
  const end = matches.length ? Math.max(...matches) : 0;
  return {
    start: dataset.periodStart || start,
    end: dataset.periodEnd || end
  };
}

function getComparePopulation(dataset) {
  return shortenCompareText(dataset.pdfPopulation || getPopulationHint(dataset), 230);
}

function getDatasetSubject(dataset) {
  if (dataset.fileSubject || dataset.bestandsonderwerp) {
    return dataset.fileSubject || dataset.bestandsonderwerp;
  }
  return `Nog niet gekoppeld - ${shortenCompareText(dataset.description || dataset.subtitle || dataset.title, 120)}`;
}

function normalizeVariableName(variable) {
  return String(variable).trim().toLowerCase();
}

function getPreferredVariableLabel(current, candidate) {
  if (!current) return candidate;
  const currentScore = getVariableLabelScore(current);
  const candidateScore = getVariableLabelScore(candidate);
  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidate : current;
  }
  return current.length >= candidate.length ? current : candidate;
}

function getVariableLabelScore(variable) {
  const text = String(variable || "").trim();
  let score = 0;
  if (text && text === text.toUpperCase()) score += 4;
  if (/[A-Z]/.test(text)) score += 1;
  if (/_/.test(text)) score += 1;
  if (/\d/.test(text)) score += 1;
  return score;
}

function normalizeCompareText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function shortenCompareText(text, maxLength) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
  if (!cleaned) return "Niet uitgelezen";
  if (cleaned.length <= maxLength) return cleaned;
  const preview = cleaned.slice(0, maxLength - 1);
  const lastSpace = preview.lastIndexOf(" ");
  return `${preview.slice(0, lastSpace > 120 ? lastSpace : maxLength - 1).trim()}.`;
}

function getRelationScore(base, candidate) {
  if (base.id === candidate.id) return 99;
  let score = 0;
  if (base.domain === candidate.domain) score += 2;
  score += overlapCount(base.themes, candidate.themes) * 2;
  score += overlapCount(base.variables, candidate.variables);
  if (base.periodEnd && candidate.periodEnd && Math.abs(base.periodEnd - candidate.periodEnd) <= 2) score += 1;
  return score;
}

function overlapCount(a, b) {
  const bSet = new Set(b.map((item) => item.toLowerCase()));
  return a.filter((item) => bSet.has(item.toLowerCase())).length;
}

function renderGuideResults() {
  const query = state.guideSearch;
  const analysis = analyseQuestion(query);
  const rankingQuery = query;
  const quality = getQuestionQuality(analysis, query);
  const normalizedQuery = normalizeSearchText(query);
  els.openCatalogFromGuide.disabled = !query;
  const results = datasets
    .map((dataset) => ({ ...dataset, ...getGuideMatch(dataset, rankingQuery, analysis, quality, normalizedQuery) }))
    .filter((dataset) => dataset.score > 0)
    .sort((a, b) => b.score - a.score || certaintyRank(b.certainty) - certaintyRank(a.certainty) || a.title.localeCompare(b.title, "nl"))
    .slice(0, 8);

  if (!query) {
    els.guideSummary.textContent = "Typ een vraag om startpunten te vinden.";
  } else {
    els.guideSummary.textContent = `${results.length} mogelijke startpunten gevonden.`;
  }

  updateGuideStages(query, results.length);
  renderQuestionCompass(analysis, query);

  if (!query) {
    els.guideResultList.innerHTML = `
      <div class="empty-state">
        <h3>Nog geen datasets voorgesteld</h3>
        <p>Typ eerst een beleidsvraag.</p>
      </div>
    `;
    els.guideResultControls.innerHTML = "";
    return;
  }

  if (!results.length) {
    els.guideResultList.innerHTML = `
      <div class="empty-state">
        <h3>Geen directe match</h3>
        <p>Probeer een bredere vraag of noem doelgroep, periode of onderwerp.</p>
      </div>
    `;
    els.guideResultControls.innerHTML = "";
    return;
  }

  const visibleLimit = state.guideLimit || getRecommendedGuideLimit(results);
  const visibleResults = results.slice(0, visibleLimit);

  els.guideResultList.innerHTML = visibleResults
    .map(
      (dataset, index) => `
        <article class="guide-result ${index === 0 ? "best-match" : ""}">
          <div class="rank">${index + 1}</div>
          <div>
            <div class="card-topline">
              <span>${dataset.domain}</span>
              <span>${index === 0 ? "Aanbevolen" : `Optie ${index + 1}`}</span>
            </div>
            <h3>${dataset.title}</h3>
            <p class="subtitle">${dataset.subtitle}</p>
            <dl class="guide-meta-row">
              <div>
                <dt>Jaren</dt>
                <dd>${dataset.years}</dd>
              </div>
              <div>
                <dt>Populatie</dt>
                <dd>${getPopulationHint(dataset)}</dd>
              </div>
            </dl>
            <div class="match-row">
              <span class="certainty ${index === 0 ? "strong" : dataset.certaintyClass}">${getGuideResultLabel(dataset, index)}</span>
              <span>${dataset.matchReason}</span>
            </div>
            <button type="button" class="text-action" data-id="${dataset.id}">Bekijk metadata</button>
          </div>
        </article>
      `
    )
    .join("");

  els.guideResultControls.innerHTML =
    results.length > visibleResults.length
      ? `<button type="button" id="showMoreGuideResults">Toon ${Math.min(3, results.length - visibleResults.length)} extra startpunten</button>`
      : "";

  const showMoreButton = document.querySelector("#showMoreGuideResults");
  if (showMoreButton) {
    showMoreButton.addEventListener("click", () => {
      state.guideLimit = Math.min(visibleLimit + 3, results.length);
      renderGuideResults();
    });
  }

  els.guideResultList.querySelectorAll(".text-action").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.id;
      state.selectionTouched = true;
      state.search = state.guideSearch;
      state.catalogSearchSource = "guide";
      els.searchInput.value = state.search;
      renderSuggestions();
      switchView("catalogView");
    });
  });
}

function updateGuideStages(query, resultCount) {
  const activeStep = !query ? 1 : resultCount ? 3 : 2;
  [
    [els.guideStageQuestion, 1],
    [els.guideStageCompass, 2],
    [els.guideStageResults, 3]
  ].forEach(([stage, step]) => {
    if (!stage) return;
    stage.classList.toggle("is-done", step < activeStep);
    stage.classList.toggle("is-active", step === activeStep);
    stage.classList.toggle("is-pending", step > activeStep);
  });
}

function getRecommendedGuideLimit(results) {
  if (!results.length) return 0;
  const topScore = results[0].score;
  const threshold = Math.max(10, Math.round(topScore * 0.65));
  const closeMatches = results.filter((dataset) => dataset.score >= threshold).length;

  if (topScore >= 24) return Math.min(5, Math.max(1, closeMatches));
  if (topScore >= 14) return Math.min(4, Math.max(1, closeMatches));
  return Math.min(2, Math.max(1, closeMatches));
}

function getGuideResultLabel(dataset, index) {
  if (index === 0) return "Beste startpunt";
  if (dataset.certainty === "Sterke match") return "Ook relevant";
  if (dataset.certainty === "Mogelijke match") return "Mogelijk relevant";
  return "Minder zeker";
}

function getPopulationHint(dataset) {
  const text = `${dataset.title} ${dataset.subtitle} ${dataset.description} ${dataset.themes.join(" ")}`.toLowerCase();
  const hints = [
    ["huishouden", "Huishoudens"],
    ["persoon", "Personen"],
    ["personen", "Personen"],
    ["werknemer", "Werknemers"],
    ["bedrijf", "Bedrijven"],
    ["student", "Studenten"],
    ["scholier", "Scholieren"],
    ["gemeente", "Gemeenten"],
    ["uitkering", "Uitkeringsontvangers"],
    ["bijstand", "Bijstandsgerechtigden"]
  ];
  const found = hints.find(([term]) => text.includes(term));
  return found ? found[1] : "Controleer in metadata";
}

function analyseQuestion(query) {
  const text = normalizeSearchText(query);
  const timeTerms = extractTimeTerms(text);
  const categories = [
    {
      id: "doelgroep",
      label: "Doelgroep / populatie",
      terms: [
        "bijstand",
        "uitkering",
        "participatiewet",
        "pwet",
        "ww",
        "aow",
        "anw",
        "wia",
        "wao",
        "huishouden",
        "huishoudens",
        "mensen",
        "persoon",
        "personen",
        "student",
        "leerling",
        "scholier",
        "werknemer",
        "werkgever",
        "kinderen",
        "kind",
        "jongeren",
        "jongere",
        "gemeente",
        "bedrijf",
        "bedrijven",
        "zelfstandige",
        "zzp"
      ],
      fallback: "Niet genoemd"
    },
    {
      id: "onderwerp",
      label: "Onderwerp",
      terms: [
        "inkomen",
        "geld",
        "bedrag",
        "vermogen",
        "schuld",
        "schulden",
        "arm",
        "arme",
        "armen",
        "armoede",
        "armoedegrens",
        "kosten",
        "werk",
        "arbeid",
        "arbeidsmarkt",
        "baan",
        "banen",
        "loon",
        "salaris",
        "onderwijs",
        "opleiding",
        "diploma",
        "school",
        "gezondheid",
        "zorg",
        "dementie",
        "wmo",
        "wlz",
        "re-integratie",
        "reintegratie",
        "traject",
        "participatie",
        "arbeidsongeschiktheid",
        "pensioen",
        "bedrijf",
        "sbi",
        "bevolking",
        "verhuizing",
        "adres",
        "regio",
        "wijk"
      ],
      fallback: "Nog niet herkend"
    },
    {
      id: "tijd",
      label: "Tijd/periode",
      terms: ["jaar", "maand", "periode", "kwartaal", "na", "voor", "tussen", "sinds", "tot", "vanaf", "ontwikkeling", "trend"],
      fallback: "Niet genoemd"
    }
  ];

  return categories.map((category) => {
    const foundTerms = category.terms.filter((term) => questionContainsTerm(text, term));
    const found = category.id === "tijd" ? [...timeTerms, ...foundTerms] : foundTerms;
    const uniqueFound = [...new Set(found)];
    return {
      ...category,
      found: uniqueFound,
      status: uniqueFound.length ? "gevonden" : "onduidelijk",
      value: uniqueFound.length ? uniqueFound.slice(0, 5).join(", ") : category.fallback
    };
  });
}

function questionContainsTerm(text, term) {
  if (term.includes(" ")) return text.includes(term);
  const tokens = text.split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
  return tokens.includes(term);
}

function extractTimeTerms(text) {
  const months = [
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december"
  ];

  const patterns = [
    /\b(?:19|20)\d{2}\s*(?:-|t\/m|tot en met|tot)\s*(?:19|20)\d{2}\b/g,
    /\b(?:19|20)\d{2}\b/g,
    /\b(?:q[1-4]|k[1-4])\b/g,
    /\b(?:19|20)\d{2}\s*[kq][1-4]\b/g,
    /\b(?:per|ieder|elke)\s+(?:maand|jaar|kwartaal)\b/g
  ];

  const matches = [];
  patterns.forEach((pattern) => {
    const found = text.match(pattern);
    if (found) matches.push(...found.map((value) => value.trim()));
  });

  months.forEach((month) => {
    if (text.includes(month)) matches.push(month);
  });

  return [...new Set(matches)];
}

function renderQuestionCompass(analysis, query) {
  const quality = getQuestionQuality(analysis, query);
  const missingHints = getMissingQuestionHints(analysis, query);
  const intro = query
    ? "Herkend uit de vraag."
    : "Nog geen vraag ingevoerd.";

  els.questionCompass.innerHTML = `
    <div class="compass-intro">
      <strong>${intro}</strong>
      <span>${quality.message}</span>
    </div>
    <div class="coverage-grid">
      ${analysis
        .map(
          (item) => `
            <div class="coverage-card ${item.status}">
              <span>${item.label}</span>
              <strong>${item.value}</strong>
            </div>
          `
        )
        .join("")}
    </div>
    ${missingHints ? `<div class="compass-hints">${missingHints}</div>` : ""}
  `;
}

function getMissingQuestionHints(analysis, query) {
  if (!query) return "";
  const missing = [];
  if (!analysis.some((item) => item.id === "doelgroep" && item.status === "gevonden")) {
    missing.push("doelgroep/populatie");
  }
  if (!analysis.some((item) => item.id === "tijd" && item.status === "gevonden")) {
    missing.push("periode of jaartal");
  }
  if (!analysis.some((item) => item.id === "onderwerp" && item.status === "gevonden")) {
    missing.push("onderwerp");
  }
  return missing.length ? `Nog scherper maken: ${missing.join(", ")}.` : "";
}

function getGuideMatch(dataset, rankingQuery, analysis, quality, normalizedQuery) {
  const matchQuality = quality || getQuestionQuality(analysis, rankingQuery);
  const normalizedMatchQuery = normalizedQuery || normalizeSearchText(rankingQuery);
  const baseScore = getRelevanceScore(dataset, rankingQuery);
  const profile = getCachedSearchProfile(rankingQuery);
  const foundTerms = [...new Set([...analysis.flatMap((item) => item.found), ...profile.coreTerms])];
  const searchDocument = datasetSearchIndex.get(dataset.id) || createDatasetSearchDocument(dataset);
  const matchedTerms = profile.expandedTerms.filter((term) =>
    searchFieldMatchesTerm(searchDocument.keywordText, searchDocument.keywordTokens, term)
    || searchFieldMatchesTerm(searchDocument.domainText, searchDocument.domainTokens, term)
  );
  const concepts = getMatchedConcepts(foundTerms, searchDocument.keywordText, searchDocument.domainText, normalizedMatchQuery);
  const coreMatches = profile.coreTerms.filter((term) =>
    searchFieldMatchesTerm(searchDocument.keywordText, searchDocument.keywordTokens, term)
    || searchFieldMatchesTerm(searchDocument.domainText, searchDocument.domainTokens, term)
  );
  const score = baseScore + coreMatches.length * 4 + matchedTerms.length + concepts.length * 4 - matchQuality.penalty;
  const certainty = score >= 28 ? "Sterke match" : score >= 13 ? "Mogelijke match" : "Lage match";
  const certaintyClass = score >= 28 ? "strong" : score >= 13 ? "possible" : "low";
  const reason = concepts.length
    ? `Past bij: ${concepts.slice(0, 3).join(", ")}`
    : coreMatches.length
      ? `Gevonden termen: ${coreMatches.slice(0, 3).join(", ")}`
      : `Beperkte match op metadata.`;

  return {
    score,
    certainty,
    certaintyClass,
    matchReason: reason
  };
}

function getMatchedConcepts(foundTerms, keywordText, domainText, normalizedQuery) {
  const concepts = [];
  const conceptMap = [
    {
      label: "inkomen / financiele situatie",
      terms: ["geld", "inkomen", "bedrag", "kosten", "loon", "salaris", "arm", "arme", "armen", "armoede", "armoedegrens", "laag inkomen", "vermogen", "schuld", "schulden"]
    },
    {
      label: "personen / doelgroep",
      terms: ["mensen", "personen", "persoon", "huishouden", "huishoudens", "kinderen", "jongeren", "student", "leerling", "werknemer"]
    },
    {
      label: "bijstand / uitkering",
      terms: ["bijstand", "uitkering", "participatiewet", "pwet", "ww", "aow", "anw", "wia", "wao", "ao"]
    },
    {
      label: "werk / arbeidsmarkt",
      terms: ["werk", "baan", "arbeid", "arbeidsmarkt", "loon", "werknemer"]
    },
    {
      label: "onderwijs / opleiding",
      terms: ["onderwijs", "opleiding", "school", "student", "leerling", "diploma", "examen"]
    },
    {
      label: "zorg / gezondheid",
      terms: ["zorg", "gezondheid", "dementie", "wmo", "wlz", "ziekenhuis", "medisch"]
    },
    {
      label: "bedrijven / vestigingen",
      terms: ["bedrijf", "bedrijven", "vestiging", "bedrijfseenheid", "sbi", "abr"]
    },
    {
      label: "regio / plaats",
      terms: ["gemeente", "regio", "wijk", "adres", "woonplaats", "verhuizing"]
    },
    {
      label: "re-integratie / participatie",
      terms: ["re-integratie", "reintegratie", "participatie", "traject", "voorziening", "srg"]
    },
    {
      label: "periode / ontwikkeling",
      terms: ["jaar", "maand", "periode", "kwartaal", "trend", "ontwikkeling", "na", "voor"]
    }
  ];

  conceptMap.forEach((concept) => {
    const questionHasConcept = concept.terms.some((term) => foundTerms.includes(term) || normalizedQuery.includes(term));
    const datasetHasConcept = concept.terms.some((term) => keywordText.includes(term) || domainText.includes(term));
    if (questionHasConcept && datasetHasConcept) concepts.push(concept.label);
  });

  return [...new Set(concepts)];
}

function getQuestionQuality(analysis, query) {
  if (!query) {
    return {
      penalty: 0,
      message: "Startpunt voor verkenning."
    };
  }

  const foundCount = analysis.filter((item) => item.status === "gevonden").length;
  const hasSubject = analysis.some((item) => item.id === "onderwerp" && item.status === "gevonden");
  const hasTarget = analysis.some((item) => item.id === "doelgroep" && item.status === "gevonden");
  const hasTime = analysis.some((item) => item.id === "tijd" && item.status === "gevonden");

  if (foundCount <= 1 || (!hasSubject && !hasTarget)) {
    return {
      penalty: 7,
      message: "Vraag is nog algemeen."
    };
  }

  if (!hasTime) {
    return {
      penalty: 3,
      message: "Een periode maakt dit scherper."
    };
  }

  return {
    penalty: 0,
    message: "Vraag is voldoende concreet."
  };
}

function certaintyRank(certainty) {
  if (certainty === "Sterke match") return 3;
  if (certainty === "Mogelijke match") return 2;
  return 1;
}

function getFilteredDatasets() {
  const query = state.search;

  return datasets
    .map((dataset) => ({ ...dataset, score: getRelevanceScore(dataset, query) }))
    .filter((dataset) => {
      const matchesSearch = !query || dataset.score > 0;
      const matchesDomain = state.domains.size === 0 || state.domains.has(dataset.domain);
      const matchesKnownPeriod = !state.knownPeriod || (dataset.periodStart > 0 && dataset.periodEnd > 0);
      const matchesRecent = !state.recent || dataset.periodEnd >= 2023;
      const matchesLongPeriod = !state.longPeriod || dataset.periodEnd - dataset.periodStart >= 15;

      return matchesSearch
        && matchesDomain
        && matchesKnownPeriod
        && matchesRecent
        && matchesLongPeriod;
    })
    .sort(sortDatasets);
}

function createDatasetSearchDocument(dataset, variables = getDatasetVariables(dataset)) {
  const weightedValues = [
    [dataset.title, 11],
    [dataset.subtitle, 9],
    [dataset.bestandsonderwerp || "", 8],
    [dataset.domain, 6],
    [dataset.description, 6],
    [dataset.pdfDescription || "", 4],
    [dataset.pdfPopulation || "", 4],
    [dataset.pdfSummary || "", 3],
    [dataset.themes.join(" "), 3],
    [dataset.variables.join(" "), 3],
    [dataset.questionFit, 2],
    [(dataset.pdfVariables || []).join(" "), 1]
  ];

  const primaryText = normalizeSearchText(`${dataset.title} ${dataset.subtitle} ${dataset.bestandsonderwerp || ""}`);
  const fullText = normalizeSearchText([
      dataset.title,
      dataset.subtitle,
      dataset.bestandsonderwerp || "",
      dataset.domain,
      dataset.description,
      dataset.pdfDescription || "",
      dataset.pdfPopulation || "",
      (dataset.pdfVariables || []).join(" ")
    ].join(" "));
  const keywordText = normalizeSearchText(getKeywordText(dataset));
  const domainText = normalizeSearchText(dataset.domain);

  return {
    normalizedFields: weightedValues.map(([value, weight]) => {
      const text = normalizeSearchText(value);
      return { text, tokens: tokenizeSearchText(text), weight };
    }),
    primaryText,
    fullText,
    fullTokens: tokenizeSearchText(fullText),
    keywordText,
    keywordTokens: tokenizeSearchText(keywordText),
    domainText,
    domainTokens: tokenizeSearchText(domainText),
    suggestionValues: [
      dataset.bestandsonderwerp || "",
      dataset.domain,
      dataset.subtitle,
      ...dataset.themes,
      ...dataset.variables,
      ...variables.slice(0, 8)
    ]
      .filter(Boolean)
      .map((value) => ({ value, normalized: normalizeSearchText(value) }))
  };
}

function getCachedSearchProfile(query) {
  const normalizedQuery = normalizeSearchText(query);
  if (searchProfileCache.has(normalizedQuery)) return searchProfileCache.get(normalizedQuery);
  trimQueryCache(searchProfileCache);
  const profile = getSearchProfile(normalizedQuery);
  searchProfileCache.set(normalizedQuery, profile);
  return profile;
}

function getQueryScoreCache(query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!relevanceScoreCache.has(normalizedQuery)) {
    trimQueryCache(relevanceScoreCache);
    relevanceScoreCache.set(normalizedQuery, new Map());
  }
  return relevanceScoreCache.get(normalizedQuery);
}

function trimQueryCache(cache) {
  if (cache.size < MAX_QUERY_CACHE_SIZE) return;
  const oldestKey = cache.keys().next().value;
  cache.delete(oldestKey);
}

function getRelevanceScore(dataset, query) {
  if (!query) return 1;

  const scoreCache = getQueryScoreCache(query);
  if (scoreCache.has(dataset.id)) return scoreCache.get(dataset.id);

  const profile = getCachedSearchProfile(query);
  const terms = profile.expandedTerms;

  if (!terms.length) {
    scoreCache.set(dataset.id, 0);
    return 0;
  }

  const searchDocument = datasetSearchIndex.get(dataset.id) || createDatasetSearchDocument(dataset);
  const hasSpecificCoreTerm = profile.coreTerms.some((term) => !profile.genericTerms.includes(term));
  let score = terms.reduce((total, term) => {
    const bestFieldWeight = searchDocument.normalizedFields.reduce(
      (best, field) => searchFieldMatchesTerm(field.text, field.tokens, term) ? Math.max(best, field.weight) : best,
      0
    );
    if (!bestFieldWeight) return total;

    const isCoreTerm = profile.coreTerms.includes(term);
    const isGenericTerm = profile.genericTerms.includes(term);
    const termFactor = isGenericTerm && hasSpecificCoreTerm ? 0.15 : isCoreTerm ? 1 : 0.55;
    return total + bestFieldWeight * termFactor;
  }, 0);

  const specificConcepts = profile.conceptGroups.filter((concept) => !concept.generic);
  const conceptsToEvaluate = specificConcepts.length ? specificConcepts : profile.conceptGroups;
  const matchedConcepts = conceptsToEvaluate.filter((concept) =>
    concept.terms.some((term) => searchFieldMatchesTerm(searchDocument.fullText, searchDocument.fullTokens, term))
  );

  if (conceptsToEvaluate.length > 1) {
    if (matchedConcepts.length === conceptsToEvaluate.length) {
      score += 12 + matchedConcepts.length * 2;
    } else {
      score *= 0.58;
    }
  }

  profile.phrases.forEach((phrase) => {
    if (searchDocument.primaryText.includes(phrase)) score += 18;
    else if (searchDocument.fullText.includes(phrase)) score += 8;
  });

  const coreMatches = profile.coreTerms.filter((term) =>
    searchFieldMatchesTerm(searchDocument.fullText, searchDocument.fullTokens, term)
  );
  if (profile.coreTerms.length > 1) {
    score += coreMatches.length * 2;
    if (coreMatches.length === profile.coreTerms.length) score += 8;
  }

  scoreCache.set(dataset.id, score);
  return score;
}

function fieldMatchesTerm(field, term) {
  return searchFieldMatchesTerm(field, tokenizeSearchText(field), term);
}

function tokenizeSearchText(field) {
  return field.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function searchFieldMatchesTerm(field, tokens, term) {
  if (term.includes(" ")) return field.includes(term);
  return tokens.some((token) => {
    if (token === term) return true;
    if (term.length < 4) return token.startsWith(term);
    return token.startsWith(term) && token.length - term.length <= 14;
  });
}

function getSearchProfile(query) {
  const importantShortTerms = new Set(["ww", "ao", "aow", "anw", "wia", "wao", "sbi", "mbo", "hbo", "wo", "bsn"]);
  const genericTerms = new Set([
    "mens",
    "mensen",
    "persoon",
    "personen",
    "burger",
    "burgers",
    "inwoner",
    "inwoners",
    "bevolking"
  ]);
  const stopWords = new Set([
    "welke",
    "welk",
    "wat",
    "waar",
    "waarvoor",
    "waarmee",
    "hoe",
    "help",
    "helpen",
    "kan",
    "kunnen",
    "mag",
    "moet",
    "we",
    "ik",
    "is",
    "zijn",
    "er",
    "over",
    "voor",
    "van",
    "met",
    "naar",
    "in",
    "op",
    "de",
    "het",
    "een",
    "en",
    "of",
    "data",
    "dataset",
    "datasets",
    "bestand",
    "bestanden",
    "microdata",
    "cbs",
    "beschikbaar",
    "beschikbare",
    "relevant",
    "relevante",
    "nuttig",
    "nodig",
    "zoeken",
    "zoek",
    "vinden",
    "tonen",
    "laten",
    "zien"
  ]);
  const normalizedQuery = normalizeSearchText(query);
  const baseTerms = normalizedQuery
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter((term) => (term.length >= 3 || importantShortTerms.has(term)) && !stopWords.has(term));

  const synonymMap = {
    geld: ["inkomen", "bedrag", "loon", "financieel"],
    salaris: ["loon", "inkomen", "bedrag", "polis"],
    arm: ["armoede", "armoedegrens", "laag inkomen", "minimuminkomen"],
    arme: ["armoede", "armoedegrens", "laag inkomen", "minimuminkomen"],
    armen: ["armoede", "armoedegrens", "laag inkomen", "minimuminkomen"],
    armoede: ["inkomen", "laag inkomen", "huishouden", "vermogen"],
    schulden: ["schuld", "inkomen", "vermogen"],
    werk: ["baan", "arbeid", "werknemer", "polis", "arbeidsmarkt"],
    banen: ["baan", "arbeid", "werknemer", "polis"],
    werkgever: ["baan", "bedrijf", "polis", "werknemer"],
    school: ["onderwijs", "opleiding", "student", "leerling"],
    studie: ["onderwijs", "opleiding", "student", "diploma"],
    diploma: ["onderwijs", "opleiding", "examen"],
    onderwijsniveau: ["onderwijs", "opleiding", "opleidingsniveau", "diploma"],
    opleidingsniveau: ["onderwijs", "opleiding", "onderwijsniveau", "diploma"],
    arbeidsmarkt: ["werk", "arbeid", "baan", "werknemer"],
    gemeente: ["regio", "adres", "woonplaats", "wijk"],
    regionaal: ["regio", "gemeente", "adres", "wijk"],
    verhuis: ["verhuizing", "adres", "gemeente"],
    verhuizing: ["adres", "gemeente", "migratie"],
    bijstand: ["uitkering", "participatiewet", "pwet", "srg"],
    participatie: ["participatiewet", "bijstand", "re-integratie", "srg"],
    participatiewet: ["bijstand", "pwet", "srg", "re-integratie"],
    reintegratie: ["re-integratie", "traject", "srg", "voorziening"],
    "re-integratie": ["reintegratie", "traject", "srg", "voorziening"],
    uitkering: ["bijstand", "ww", "aow", "anw", "wia", "wao", "ao"],
    arbeidsongeschikt: ["arbeidsongeschiktheid", "ao", "wia", "wao"],
    pensioen: ["aow", "pensioen", "pijler"],
    bedrijf: ["bedrijven", "bedrijfseenheid", "vestiging", "abr", "sbi"],
    bedrijven: ["bedrijf", "bedrijfseenheid", "vestiging", "abr", "sbi"],
    zorg: ["gezondheid", "medisch", "ziekenhuis", "wmo", "wlz"],
    gezondheid: ["zorg", "medisch", "ziekenhuis"],
    mensen: ["persoon", "personen", "bevolking"],
    persoon: ["personen", "mensen", "bevolking"],
    personen: ["persoon", "mensen", "bevolking"],
    huishouden: ["huishoudens", "inkomen", "vermogen"],
    huishoudens: ["huishouden", "inkomen", "vermogen"]
  };

  const conceptAliasMap = {
    arm: ["arm", "armoede", "armoedegrens", "laag inkomen", "minimuminkomen"],
    arme: ["arm", "armoede", "armoedegrens", "laag inkomen", "minimuminkomen"],
    armen: ["arm", "armoede", "armoedegrens", "laag inkomen", "minimuminkomen"],
    armoede: ["armoede", "armoedegrens", "arm", "laag inkomen", "minimuminkomen"],
    bijstand: ["bijstand", "participatiewet", "pwet"],
    participatie: ["participatie", "participatiewet", "bijstand", "re-integratie"],
    participatiewet: ["participatiewet", "bijstand", "pwet"],
    werk: ["werk", "baan", "arbeid", "arbeidsmarkt"],
    banen: ["baan", "werk", "arbeid", "arbeidsmarkt"],
    arbeidsmarkt: ["arbeidsmarkt", "werk", "arbeid", "baan"],
    school: ["school", "onderwijs", "opleiding"],
    studie: ["studie", "onderwijs", "opleiding"],
    onderwijsniveau: ["onderwijsniveau", "opleidingsniveau", "onderwijs", "opleiding", "diploma"],
    opleidingsniveau: ["opleidingsniveau", "onderwijsniveau", "onderwijs", "opleiding", "diploma"],
    regionaal: ["regionaal", "regio", "gemeente"],
    gemeente: ["gemeente", "regio", "woonplaats"],
    bedrijf: ["bedrijf", "bedrijven", "bedrijfseenheid", "vestiging"],
    bedrijven: ["bedrijven", "bedrijf", "bedrijfseenheid", "vestiging"]
  };

  const conceptGroups = baseTerms.map((term) => {
    const conceptTerms = new Set(conceptAliasMap[term] || [term]);
    getTermVariants(term).forEach((variant) => conceptTerms.add(variant));
    return {
      term,
      generic: genericTerms.has(term),
      terms: [...conceptTerms]
    };
  });
  const expanded = new Set(conceptGroups.flatMap((concept) => concept.terms));

  const phrases = [];
  Object.keys(synonymMap).forEach((term) => {
    if (term.includes(" ") && normalizedQuery.includes(term)) phrases.push(term);
  });
  const quotedPhrases = [...normalizedQuery.matchAll(/"([^"]+)"/g)].map((match) => normalizeSearchText(match[1])).filter(Boolean);

  return {
    coreTerms: [...new Set(baseTerms)],
    expandedTerms: [...expanded],
    genericTerms: [...genericTerms],
    conceptGroups,
    phrases: [...new Set([...phrases, ...quotedPhrases])]
  };
}

function getSearchTerms(query) {
  return getSearchProfile(query).expandedTerms;
}

function getTermVariants(term) {
  const variants = new Set();
  if (term.endsWith("en") && term.length > 5) variants.add(term.slice(0, -2));
  if (term.endsWith("s") && term.length > 4) variants.add(term.slice(0, -1));
  if (term.endsWith("eren") && term.length > 6) variants.add(term.slice(0, -4));
  if (term === "personen") variants.add("persoon");
  if (term === "kinderen") variants.add("kind");
  if (term === "jongeren") variants.add("jongere");
  if (term === "bedrijven") variants.add("bedrijf");
  return [...variants];
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ã«/g, "e")
    .replace(/ë/g, "e")
    .replace(/\s+/g, " ")
    .trim();
}

function getCatalogSuggestions(query) {
  const normalizedQuery = normalizeSearchText(query);
  const scoredDatasets = datasets
    .map((dataset) => ({ dataset, score: getRelevanceScore(dataset, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.dataset.title.localeCompare(b.dataset.title, "nl"))
    .slice(0, 4)
    .map((item) => item.dataset.title);

  const metadataOptions = datasets
    .flatMap((dataset) => datasetSearchIndex.get(dataset.id)?.suggestionValues || [])
    .filter((item) => item.normalized.includes(normalizedQuery))
    .map((item) => item.value)
    .slice(0, 8);

  return [...new Set([...scoredDatasets, ...metadataOptions])].slice(0, 5);
}

function sortDatasets(a, b) {
  if (state.sort === "title") return a.title.localeCompare(b.title, "nl");
  if (state.sort === "domain") return a.domain.localeCompare(b.domain, "nl") || a.title.localeCompare(b.title, "nl");
  return b.score - a.score || a.title.localeCompare(b.title, "nl");
}

function render() {
  const filtered = getFilteredDatasets();

  if (!filtered.some((dataset) => dataset.id === state.selectedId)) {
    state.selectedId = filtered[0]?.id || null;
  }

  renderTransferredSearchNotice();
  updateSortLabel();
  els.resultCount.textContent = filtered.length;
  els.activeSummary.textContent = getActiveSummary(filtered.length);

  if (state.activeView === "catalogView") {
    renderDatasetList(filtered);
    renderDetail(filtered.find((dataset) => dataset.id === state.selectedId));
  } else if (state.activeView === "exploreView") {
    renderInsights();
  } else if (state.activeView === "compareView") {
    renderCompare();
  }

  renderSelectionDock();
}

function updateSortLabel() {
  const relevanceOption = els.sortSelect?.querySelector('option[value="relevance"]');
  if (relevanceOption) {
    relevanceOption.textContent = state.search ? "Beste match" : "Standaardvolgorde";
  }
}

function renderTransferredSearchNotice() {
  const isTransferred = state.catalogSearchSource === "guide" && Boolean(state.search);
  els.transferredSearchNotice.hidden = !isTransferred;
  els.transferredSearchQuery.textContent = isTransferred ? state.search : "";
}

function getActiveSummary(count) {
  const parts = [];
  if (state.search) parts.push(`zoekterm: "${state.search}"`);
  if (state.domains.size) parts.push(`${state.domains.size} domeinfilter(s)`);
  if (state.knownPeriod) parts.push("periode bekend");
  if (state.recent) parts.push("2023 of later");
  if (state.longPeriod) parts.push("15+ jaar beschikbaar");

  if (!parts.length) return "Gebruik zoeken en filters om de lijst te verfijnen.";
  const sortNote = state.sort === "relevance" && state.search
    ? " Gesorteerd op beste match in titel, onderwerp, CBS-beschrijving, PDF-tekst en variabelen."
    : "";
  return `${count} resultaat/resultaten voor ${parts.join(", ")}.${sortNote}`;
}

function renderDatasetList(filtered) {
  if (!filtered.length) {
    els.datasetList.innerHTML = `
      <div class="empty-state">
        <h3>Geen datasets gevonden</h3>
        <p>Probeer een bredere term, zoals bijstand, inkomen, werk of onderwijs.</p>
      </div>
    `;
    return;
  }

  els.datasetList.innerHTML = filtered
    .map(
      (dataset) => {
        return `
        <article class="dataset-card ${dataset.id === state.selectedId ? "selected" : ""}">
          <button type="button" data-id="${dataset.id}" class="card-button">
            <div class="card-topline">
              <span>${dataset.domain}</span>
              <span>${dataset.years}</span>
            </div>
            <h3>${dataset.title}</h3>
            <p class="subtitle">${dataset.subtitle}</p>
            <p>${getCatalogCardSummary(dataset)}</p>
            <div class="tag-row">
              ${getCatalogCardTags(dataset).map((tag) => `<span>${tag}</span>`).join("")}
            </div>
          </button>
        </article>
      `;
      }
    )
    .join("");

  els.datasetList.querySelectorAll(".card-button").forEach((button) => {
    button.addEventListener("click", () => {
      selectDataset(button.dataset.id);
    });
  });
}

function selectDataset(datasetId) {
  const datasetChanged = state.selectedId !== datasetId;
  state.selectedId = datasetId;
  state.selectedVariable = null;
  if (datasetChanged) {
    state.variableSearch = "";
    state.variableLimit = 80;
  }
  state.selectionTouched = true;
  render();
}

function toggleCompareDataset(datasetId) {
  if (state.compareIds.includes(datasetId)) {
    state.compareIds = state.compareIds.filter((id) => id !== datasetId);
    state.compareFocusIds = [0, 1, 2].map((slot) => state.compareFocusIds[slot] === datasetId ? "" : state.compareFocusIds[slot] || "");
  } else if (state.compareIds.length < state.selectedLimit) {
    state.compareIds = [...state.compareIds, datasetId];
    if (state.compareFocusIds.filter(Boolean).length < 3) {
      const emptySlot = [0, 1, 2].find((slot) => !state.compareFocusIds[slot]);
      if (emptySlot !== undefined) state.compareFocusIds[emptySlot] = datasetId;
    }
  }
  render();
}

function renderSelectionDock() {
  if (!els.selectionDock) return;

  const selected = datasetById.get(state.selectedId);
  const basket = state.compareIds
    .map((id) => datasetById.get(id))
    .filter(Boolean);

  const shouldShowDock = state.selectionTouched || basket.length > 0;
  els.selectionDock.hidden = !shouldShowDock;
  if (!shouldShowDock) return;

  if (state.selectionDockCollapsed) {
    els.selectionDock.classList.add("collapsed");
    els.selectionDock.innerHTML = `
      <button type="button" id="restoreSelectionDock" class="dock-restore">
        Geselecteerde bestanden ${basket.length ? `(${basket.length})` : ""}
      </button>
    `;

    document.querySelector("#restoreSelectionDock")?.addEventListener("click", () => {
      state.selectionDockCollapsed = false;
      render();
    });
    return;
  }

  els.selectionDock.classList.remove("collapsed");

  if (!selected) {
    els.selectionDock.innerHTML = `
      <div class="selection-dock-empty">
        <strong>Geen bestand geselecteerd</strong>
        <span>Klik in de catalogus op een datasetkaart.</span>
      </div>
      <button type="button" id="hideSelectionDock" class="dock-hide" aria-label="Verberg geselecteerde bestanden">Verberg</button>
    `;
    document.querySelector("#hideSelectionDock")?.addEventListener("click", () => {
      state.selectionDockCollapsed = true;
      render();
    });
    return;
  }

  const selectedInBasket = state.compareIds.includes(selected.id);
  const basketFull = state.compareIds.length >= state.selectedLimit && !selectedInBasket;

  els.selectionDock.innerHTML = `
    <button type="button" id="hideSelectionDock" class="dock-hide" aria-label="Verberg geselecteerde bestanden">Verberg</button>
    <div class="selection-dock-main">
      <div>
        <span class="dock-label">Geselecteerd bestand</span>
        <strong>${selected.title}</strong>
        <small>${selected.subtitle}</small>
      </div>
      <button type="button" id="toggleSelectedBasket" ${basketFull ? "disabled" : ""}>
        ${selectedInBasket ? "In selectie" : basketFull ? "Max bereikt" : "Toevoegen aan selectie"}
      </button>
    </div>
    <div class="selection-basket">
      <div class="selection-basket-head">
        <span>Geselecteerde bestanden</span>
        <strong>${basket.length}/${state.selectedLimit}</strong>
      </div>
      ${
        basket.length
          ? `<div class="selection-basket-list">
              ${basket
                .map(
                  (dataset) => `
                    <div class="selection-basket-item">
                      <button type="button" class="dock-open" data-id="${dataset.id}">${dataset.title}</button>
                      <button type="button" class="dock-remove" data-id="${dataset.id}" aria-label="Verwijder ${dataset.title}">x</button>
                    </div>
                  `
                )
                .join("")}
            </div>`
          : `<p>Nog geen geselecteerde bestanden.</p>`
      }
    </div>
  `;

  document.querySelector("#toggleSelectedBasket")?.addEventListener("click", () => {
    toggleCompareDataset(selected.id);
  });

  document.querySelector("#hideSelectionDock")?.addEventListener("click", () => {
    state.selectionDockCollapsed = true;
    render();
  });

  els.selectionDock.querySelectorAll(".dock-open").forEach((button) => {
    button.addEventListener("click", () => selectDatasetFromDock(button.dataset.id));
  });

  els.selectionDock.querySelectorAll(".dock-remove").forEach((button) => {
    button.addEventListener("click", () => toggleCompareDataset(button.dataset.id));
  });
}

function getCatalogCardTags(dataset) {
  return (dataset.variables || []).slice(0, 4);
}

function getCatalogCardSummary(dataset) {
  const genericPrefix = "CBS-catalogusrecord voor ";
  if (!dataset.description || dataset.description.startsWith(genericPrefix)) {
    return "Geen korte CBS-beschrijving beschikbaar in deze testset.";
  }

  const cleaned = dataset.description
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/Raadpleeg de metadata voor de volledige documentatie\.?/gi, "")
    .trim();

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 2);

  const selected = [];
  sentences.forEach((sentence) => {
    const next = [...selected, sentence].join(" ");
    if (next.length <= 300) selected.push(sentence);
  });

  return selected.length ? selected.join(" ") : shortenCatalogPreview(sentences[0] || cleaned);
}

function shortenCatalogPreview(text) {
  if (text.length <= 300) return text;

  const preview = text.slice(0, 280);
  const clauseEnd = Math.max(preview.lastIndexOf(","), preview.lastIndexOf(";"), preview.lastIndexOf(":"));
  if (clauseEnd > 190) {
    return preview.slice(0, clauseEnd).trim().replace(/[,:;]+$/, ".");
  }

  const lastSpace = preview.lastIndexOf(" ");
  const end = lastSpace > 190 ? lastSpace : 280;
  return `${preview.slice(0, end).trim().replace(/[,:;]+$/, "")}.`;
}

function getPdfBrief(dataset) {
  const source = dataset.pdfDescription || "";
  if (!source.trim()) return "";

  const cleaned = source
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\bSSB\s*-\s*component\b/gi, "bestand")
    .replace(/\bDeze component\b/g, "Dit bestand")
    .replace(/\bDeze buscomponent\b/g, "Dit bestand")
    .trim();

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 2);

  const selected = [];
  sentences.forEach((sentence) => {
    const next = [...selected, sentence].join(" ");
    if (next.length <= 300) selected.push(sentence);
  });

  return (selected.length ? selected : sentences).join(" ");
}

function getPdfViewerUrl(pdfUrl) {
  return `https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}`;
}

function renderDetail(dataset) {
  if (!dataset) {
    els.detailPanel.innerHTML = `
      <div class="empty-detail">
        <h2>Selecteer een dataset</h2>
        <p>Wanneer er resultaten zijn verschijnt hier de metadata-samenvatting.</p>
      </div>
    `;
    return;
  }

  const pdfBrief = getPdfBrief(dataset);

  els.detailPanel.innerHTML = `
    <div class="detail-heading">
      <p>${dataset.domain}</p>
      <h2>${dataset.title}</h2>
      <span>${dataset.subtitle}</span>
    </div>

    ${
      pdfBrief
        ? `<section class="pdf-brief">
            <h3>Korte PDF-samenvatting</h3>
            <p>${pdfBrief}</p>
          </section>`
        : `<section class="pdf-brief muted">
            <h3>Korte PDF-samenvatting</h3>
            <p>Voor dit bestand is geen aparte PDF-samenvatting uitgelezen. Gebruik de CBS-beschrijving en open de metadata-PDF voor de volledige documentatie.</p>
          </section>`
    }

    <section>
      <h3>Kernmetadata</h3>
      <dl class="meta-list">
        <div>
          <dt>Beschikbare jaren</dt>
          <dd>${dataset.years}</dd>
        </div>
        <div>
          <dt>Domein</dt>
          <dd>${dataset.domain}</dd>
        </div>
        <div>
          <dt>Bron in prototype</dt>
          <dd>${dataset.sourceType || "CBS-catalogus"}</dd>
        </div>
      </dl>
    </section>

    <section>
      <h3>Kernvariabelen</h3>
      <ul class="variable-list">
        ${dataset.variables.map((variable) => `<li>${variable}</li>`).join("")}
      </ul>
    </section>

    <section class="attention">
      <h3>Let op bij interpretatie</h3>
      <p>${dataset.limitations}</p>
    </section>

    <div class="metadata-actions">
      <a class="metadata-link" href="${dataset.metadataUrl}" target="_blank" rel="noreferrer">
        Open CBS-pagina
      </a>
      ${
        dataset.pdfUrl
          ? `<div class="pdf-actions">
              <a class="metadata-link secondary" href="${getPdfViewerUrl(dataset.pdfUrl)}" target="_blank" rel="noreferrer">
                Bekijk PDF
              </a>
              <a class="metadata-link secondary download-link" href="${dataset.pdfUrl}" download target="_blank" rel="noreferrer">
                Download PDF
              </a>
            </div>`
          : ""
      }
    </div>
  `;
}

init();


