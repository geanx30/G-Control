const state = {
  licenses: [],
  users: [],
  assignments: [],
  accessUsers: [],
  financialItems: [],
  emailSettings: null,
  auditLogs: []
};

let currentView = "dashboard";
let searchTerm = "";
let currentUser = null;
let financialMode = "all";
let financialFilterType = "software";
let financialFilter = "";
let financialDateFromFilter = "";
let financialDateToFilter = "";
let licenseQuickFilter = "";
let assignmentQuickFilter = "";
let financialQuickFilter = "";
let settingsPane = "email";
const LAST_VIEW_KEY = "gcontrol.lastView";
const PAGE_SIZE = 50;
const expandedMultiLicenseSoftware = new Set();
const expandedAssignmentSoftware = new Set();
const formHomes = new Map();
const pagination = {
  licenses: 1,
  users: 1,
  assignments: 1,
  financial: 1,
  access: 1,
  audit: 1
};
const tableSorts = {
  licenses: { key: "software", direction: "asc" },
  users: { key: "name", direction: "asc" },
  assignments: { key: "software", direction: "asc" },
  financial: null,
  access: { key: "username", direction: "asc" },
  audit: { key: "createdAt", direction: "desc" }
};

const els = {
  pageTitle: document.querySelector("#pageTitle"),
  globalSearch: document.querySelector("#globalSearch"),
  navItems: document.querySelectorAll(".nav-item"),
  views: document.querySelectorAll(".view"),
  licenseForm: document.querySelector("#licenseForm"),
  userForm: document.querySelector("#userForm"),
  assignmentForm: document.querySelector("#assignmentForm"),
  financialForm: document.querySelector("#financialForm"),
  licenseRows: document.querySelector("#licenseRows"),
  userRows: document.querySelector("#userRows"),
  assignmentRows: document.querySelector("#assignmentRows"),
  financialRows: document.querySelector("#financialRows"),
  licensePagination: document.querySelector("#licensePagination"),
  userPagination: document.querySelector("#userPagination"),
  assignmentPagination: document.querySelector("#assignmentPagination"),
  financialPagination: document.querySelector("#financialPagination"),
  financialAllMode: document.querySelector("#financialAllMode"),
  financialFilteredMode: document.querySelector("#financialFilteredMode"),
  financialFilterType: document.querySelector("#financialFilterType"),
  financialValueFilter: document.querySelector("#financialValueFilter"),
  financialDateRangeFilter: document.querySelector("#financialDateRangeFilter"),
  financialDateFromFilter: document.querySelector("#financialDateFromFilter"),
  financialDateToFilter: document.querySelector("#financialDateToFilter"),
  assignmentLicense: document.querySelector("#assignmentLicense"),
  assignmentUser: document.querySelector("#assignmentUser"),
  financialLicense: document.querySelector("#financialLicense"),
  accessForm: document.querySelector("#accessForm"),
  accountForm: document.querySelector("#accountForm"),
  accessRows: document.querySelector("#accessRows"),
  accessPagination: document.querySelector("#accessPagination"),
  emailSettingsForm: document.querySelector("#emailSettingsForm"),
  emailSettingsStatus: document.querySelector("#emailSettingsStatus"),
  settingsEmailTab: document.querySelector("#settingsEmailTab"),
  settingsAuditTab: document.querySelector("#settingsAuditTab"),
  settingsEmailPane: document.querySelector("#settingsEmailPane"),
  settingsAuditPane: document.querySelector("#settingsAuditPane"),
  refreshAuditLogs: document.querySelector("#refreshAuditLogs"),
  clearAuditLogs: document.querySelector("#clearAuditLogs"),
  auditRows: document.querySelector("#auditRows"),
  auditPagination: document.querySelector("#auditPagination"),
  emailProvider: document.querySelector("#emailProvider"),
  editDialog: document.querySelector("#editDialog"),
  editDialogBody: document.querySelector("#editDialogBody"),
  editDialogTitle: document.querySelector("#editDialogTitle"),
  closeEditDialog: document.querySelector("#closeEditDialog"),
  loginForm: document.querySelector("#loginForm"),
  loginScreen: document.querySelector("#loginScreen"),
  loginError: document.querySelector("#loginError"),
  accountButton: document.querySelector("#accountButton"),
  logoutButton: document.querySelector("#logoutButton"),
  currentUserLabel: document.querySelector("#currentUserLabel"),
  copyrightYear: document.querySelector("#copyrightYear"),
  licenseCsvFile: document.querySelector("#licenseCsvFile"),
  userCsvFile: document.querySelector("#userCsvFile"),
  assignmentCsvFile: document.querySelector("#assignmentCsvFile"),
  financialCsvFile: document.querySelector("#financialCsvFile"),
  softwareOptions: document.querySelector("#softwareOptions"),
  capacityWarning: document.querySelector("#capacityWarning"),
  reportBody: document.querySelector("#reportBody"),
  reportTitle: document.querySelector("#reportTitle"),
  reportType: document.querySelector("#reportType"),
  reportSoftware: document.querySelector("#reportSoftware"),
  reportUser: document.querySelector("#reportUser"),
  reportStatus: document.querySelector("#reportStatus"),
  reportFilial: document.querySelector("#reportFilial"),
  reportDueFrom: document.querySelector("#reportDueFrom"),
  reportDueTo: document.querySelector("#reportDueTo")
};

document.addEventListener("DOMContentLoaded", async () => {
  document.body.classList.add("locked");
  if (els.copyrightYear) els.copyrightYear.textContent = new Date().getFullYear();
  wireEvents();
  await checkSession();
});

function wireEvents() {
  els.navItems.forEach((button) => {
    button.addEventListener("click", () => {
      clearQuickFilters();
      setView(button.dataset.view);
      render();
    });
  });

  wireMetricActions();
  wireTableSorting();

  els.globalSearch.addEventListener("input", (event) => {
    searchTerm = event.target.value.trim().toLowerCase();
    resetPagination();
    render();
  });

  els.licenseForm.addEventListener("submit", saveLicense);
  els.userForm.addEventListener("submit", saveUser);
  els.assignmentForm.addEventListener("submit", saveAssignment);
  els.financialForm.addEventListener("submit", saveFinancialItem);
  els.accessForm.addEventListener("submit", saveAccessUser);
  els.accountForm.addEventListener("submit", saveAccount);
  els.emailSettingsForm.addEventListener("submit", saveEmailSettings);
  els.loginForm.addEventListener("submit", login);
  els.accountButton.addEventListener("click", openAccount);
  els.logoutButton.addEventListener("click", logout);
  els.closeEditDialog.addEventListener("click", closeEditDialog);
  els.editDialog.addEventListener("close", restoreEditingForm);
  document.querySelector("#clearLicense").addEventListener("click", clearLicenseForm);
  document.querySelector("#clearUser").addEventListener("click", clearUserForm);
  document.querySelector("#clearAssignment").addEventListener("click", clearAssignmentForm);
  document.querySelector("#clearFinancial").addEventListener("click", clearFinancialForm);
  document.querySelector("#clearAccess").addEventListener("click", clearAccessForm);
  document.querySelector("#clearAccountPassword").addEventListener("click", clearAccountPasswordFields);
  document.querySelector("#newLicense").addEventListener("click", newLicense);
  document.querySelector("#newUser").addEventListener("click", newUser);
  document.querySelector("#newAssignment").addEventListener("click", newAssignment);
  document.querySelector("#newFinancial").addEventListener("click", newFinancial);
  document.querySelector("#newAccess").addEventListener("click", newAccess);
  document.querySelector("#downloadLicenseTemplate").addEventListener("click", downloadLicenseTemplate);
  els.licenseCsvFile.addEventListener("change", importLicenseCsv);
  document.querySelector("#downloadUserTemplate").addEventListener("click", downloadUserTemplate);
  els.userCsvFile.addEventListener("change", importUserCsv);
  document.querySelector("#downloadAssignmentTemplate").addEventListener("click", downloadAssignmentTemplate);
  els.assignmentCsvFile.addEventListener("change", importAssignmentCsv);
  document.querySelector("#downloadFinancialTemplate").addEventListener("click", downloadFinancialTemplate);
  els.financialCsvFile.addEventListener("change", importFinancialCsv);
  document.querySelector("#lookupMegaFinancial").addEventListener("click", lookupMegaFinancial);
  document.querySelector("#syncMegaFinancial").addEventListener("click", syncMegaFinancial);
  document.querySelector("#sendFinancialAlerts").addEventListener("click", sendFinancialAlerts);
  document.querySelector("#testEmailSettings").addEventListener("click", sendFinancialAlerts);
  els.settingsEmailTab.addEventListener("click", () => setSettingsPane("email"));
  els.settingsAuditTab.addEventListener("click", () => setSettingsPane("audit"));
  els.refreshAuditLogs.addEventListener("click", async () => {
    await loadAuditLogs();
    renderAuditRows();
  });
  els.clearAuditLogs.addEventListener("click", clearAuditLogs);
  els.financialAllMode.addEventListener("click", () => setFinancialMode("all"));
  els.financialFilteredMode.addEventListener("click", () => setFinancialMode("filtered"));
  els.financialFilterType.addEventListener("change", (event) => {
    financialFilterType = event.target.value;
    financialFilter = "";
    financialQuickFilter = "";
    resetPagination("financial");
    renderFinancialRows();
  });
  els.financialValueFilter.addEventListener("change", (event) => {
    financialFilter = event.target.value;
    financialQuickFilter = "";
    resetPagination("financial");
    renderFinancialRows();
  });
  els.financialDateFromFilter.addEventListener("change", (event) => {
    financialDateFromFilter = event.target.value;
    financialQuickFilter = "";
    resetPagination("financial");
    renderFinancialRows();
  });
  els.financialDateToFilter.addEventListener("change", (event) => {
    financialDateToFilter = event.target.value;
    financialQuickFilter = "";
    resetPagination("financial");
    renderFinancialRows();
  });
  els.emailProvider.addEventListener("change", toggleEmailProviderFields);
  document.querySelector("#exportData").addEventListener("click", exportJson);
  document.querySelector("#importFile").addEventListener("change", importJson);
  document.querySelector("#copyReport").addEventListener("click", copyReport);
  document.querySelector("#downloadCsv").addEventListener("click", downloadCsv);
  [els.reportType, els.reportSoftware, els.reportUser, els.reportStatus, els.reportFilial, els.reportDueFrom, els.reportDueTo]
    .forEach((input) => input.addEventListener("change", renderReport));
}

function wireTableSorting() {
  document.querySelectorAll(".sort-header").forEach((button) => {
    button.addEventListener("click", () => {
      const table = button.dataset.sortTable;
      const key = button.dataset.sortKey;
      const current = tableSorts[table];
      tableSorts[table] = {
        key,
        direction: current?.key === key && current.direction === "asc" ? "desc" : "asc"
      };
      resetPagination(table);
      renderSortedTable(table);
    });
  });
}

function renderSortedTable(table) {
  if (table === "licenses") renderLicenseRows();
  if (table === "users") renderUserRows();
  if (table === "assignments") renderAssignmentRows();
  if (table === "financial") renderFinancialRows();
  if (table === "access") renderAccessRows();
  updateSortIndicators();
}

function wireMetricActions() {
  bindMetricAction("#metricSoftware", () => showLicenseMetric(""));
  bindMetricAction("#metricLicenses", () => showLicenseMetric(""));
  bindMetricAction("#metricInUse", () => showAssignmentMetric("active"));
  bindMetricAction("#metricAvailable", () => showLicenseMetric("available"));
  bindMetricAction("#metricExpired", () => showLicenseMetric("expired"));
  bindMetricAction("#metricBills", () => showFinancialMetric(""));
  bindMetricAction("#metricBillAmount", () => showFinancialMetric(""));
  bindMetricAction("#metricBillPending", () => showFinancialMetric("pending"));
  bindMetricAction("#metricBillExpired", () => showFinancialMetric("expired"));
  bindMetricAction("#metricBillNoAp", () => showFinancialMetric("noAp"));
}

function bindMetricAction(selector, action) {
  const metric = document.querySelector(selector)?.closest(".metric");
  if (!metric) return;

  metric.classList.add("clickable");
  metric.tabIndex = 0;
  metric.setAttribute("role", "button");
  metric.addEventListener("click", action);
  metric.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    action();
  });
}

function showLicenseMetric(filter) {
  clearSearch();
  resetPagination("licenses");
  licenseQuickFilter = filter;
  assignmentQuickFilter = "";
  financialQuickFilter = "";
  setView("licenses");
  renderLicenseRows();
}

function showAssignmentMetric(filter) {
  clearSearch();
  resetPagination("assignments");
  assignmentQuickFilter = filter;
  licenseQuickFilter = "";
  financialQuickFilter = "";
  setView("assignments");
  renderAssignmentRows();
}

function showFinancialMetric(filter) {
  clearSearch();
  resetPagination("financial");
  financialQuickFilter = filter;
  licenseQuickFilter = "";
  assignmentQuickFilter = "";
  financialMode = "all";
  financialFilter = "";
  financialDateFromFilter = "";
  financialDateToFilter = "";
  setView("financial");
  renderFinancialRows();
}

function clearSearch() {
  searchTerm = "";
  if (els.globalSearch) els.globalSearch.value = "";
}

function clearQuickFilters() {
  licenseQuickFilter = "";
  assignmentQuickFilter = "";
  financialQuickFilter = "";
}

async function checkSession() {
  try {
    const data = await api("/api/auth/me");
    currentUser = data.user;
    unlockApp();
    await loadData();
  } catch {
    lockApp();
  }
}

async function login(event) {
  event.preventDefault();
  els.loginError.hidden = true;
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: value("#loginUsername"),
        password: value("#loginPassword")
      })
    });
    currentUser = data.user;
    els.loginForm.reset();
    unlockApp();
    await loadData();
  } catch (error) {
    els.loginError.hidden = false;
    els.loginError.textContent = error.message;
  }
}

async function logout() {
  await api("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => null);
  localStorage.removeItem(LAST_VIEW_KEY);
  currentUser = null;
  state.licenses = [];
  state.users = [];
  state.assignments = [];
  state.accessUsers = [];
  lockApp();
}

function lockApp() {
  document.body.classList.add("locked");
  document.body.classList.remove("readonly");
  document.body.classList.remove("not-admin");
  currentUser = null;
}

function unlockApp() {
  document.body.classList.remove("locked");
  document.body.classList.toggle("readonly", !canManageData());
  document.body.classList.toggle("not-admin", !isAdmin());
  els.currentUserLabel.textContent = `${currentUser.displayName || currentUser.username} - ${roleLabel(currentUser.role)}`;
}

async function loadData() {
  try {
    const data = await api("/api/data");
    state.licenses = data.licenses || [];
    state.users = data.users || [];
    state.assignments = data.assignments || [];
    state.financialItems = data.financialItems || [];
    if (isAdmin()) {
      await loadAccessUsers();
      await loadEmailSettings();
      await loadAuditLogs();
    }
    restoreLastView();
    render();
  } catch (error) {
    render();
    showLoadError(error.message);
  }
}

function restoreLastView() {
  if (currentView !== "dashboard") return;
  const lastView = localStorage.getItem(LAST_VIEW_KEY);
  if (lastView && canOpenView(lastView)) {
    currentView = lastView;
  }
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) lockApp();
    throw new Error(payload.error || "Nao foi possivel concluir a operacao.");
  }
  return payload;
}

function setView(view) {
  if (!canOpenView(view)) view = "dashboard";
  currentView = view;
  localStorage.setItem(LAST_VIEW_KEY, view);
  els.views.forEach((section) => section.classList.toggle("active-view", section.id === view));
  els.navItems.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  els.pageTitle.textContent = {
    dashboard: "Painel",
    licenses: "Licencas",
    users: "Usuarios",
    assignments: "Vinculos",
    financial: "Financeiro",
    reports: "Relatorios",
    access: "Acessos",
    settings: "Configuracoes"
  }[view];
}

function canOpenView(view) {
  const exists = Array.from(els.views).some((section) => section.id === view);
  if (!exists) return false;
  if ((view === "access" || view === "settings") && !isAdmin()) return false;
  return true;
}

async function saveLicense(event) {
  event.preventDefault();
  const license = {
    software: value("#software"),
    vendor: value("#vendor"),
    type: value("#licenseType"),
    key: value("#licenseKey"),
    seats: Math.max(1, Number(value("#seats")) || 1),
    expiresAt: value("#expiresAt"),
    supplier: value("#supplier"),
    notes: value("#licenseNotes")
  };

  const licenseId = value("#licenseId");
  if (licenseId) {
    const confirmed = await confirmAction(
      "Alterar chave",
      "Confirmar alteracao desta chave/licenca?",
      "Alterar"
    );
    if (!confirmed) return;
  }
  await saveResource(licenseId ? `/api/licenses/${licenseId}` : "/api/licenses", licenseId ? "PUT" : "POST", license);
  closeEditDialog();
  clearLicenseForm();
  await loadData();
}

async function saveUser(event) {
  event.preventDefault();
  const user = {
    name: value("#userName"),
    email: value("#email"),
    department: value("#department"),
    device: value("#device"),
    status: value("#userStatus")
  };

  const userId = value("#userId");
  if (userId) {
    const confirmed = await confirmAction(
      "Alterar usuario",
      "Confirmar alteracao deste usuario?",
      "Alterar"
    );
    if (!confirmed) return;
  }
  await saveResource(userId ? `/api/users/${userId}` : "/api/users", userId ? "PUT" : "POST", user);
  closeEditDialog();
  clearUserForm();
  await loadData();
}

async function saveAssignment(event) {
  event.preventDefault();
  els.capacityWarning.hidden = true;
  const assignment = {
    licenseId: value("#assignmentLicense"),
    userId: value("#assignmentUser"),
    startDate: value("#startDate") || today(),
    returnDate: value("#returnDate"),
    status: value("#assignmentStatus"),
    notes: value("#assignmentNotes")
  };

  const assignmentId = value("#assignmentId");
  try {
    if (assignmentId) {
      const confirmed = await confirmAction(
        "Alterar vinculo",
        "Confirmar alteracao deste vinculo?",
        "Alterar"
      );
      if (!confirmed) return;
    }
    await saveResource(
      assignmentId ? `/api/assignments/${assignmentId}` : "/api/assignments",
      assignmentId ? "PUT" : "POST",
      assignment
    );
    closeEditDialog();
    clearAssignmentForm();
    await loadData();
  } catch (error) {
    els.capacityWarning.hidden = false;
    els.capacityWarning.textContent = error.message;
  }
}

async function saveFinancialItem(event) {
  event.preventDefault();
  const item = buildFinancialItemFromForm();

  const financialId = value("#financialId");
  if (financialId) {
    const confirmed = await confirmAction(
      "Alterar boleto",
      "Confirmar alteracao deste item financeiro?",
      "Alterar"
    );
    if (!confirmed) return;
  }

  await saveResource(
    financialId ? `/api/financial-items/${financialId}` : "/api/financial-items",
    financialId ? "PUT" : "POST",
    item
  );
  closeEditDialog();
  clearFinancialForm();
  await loadData();
}

function buildFinancialItemFromForm() {
  const status = value("#financialStatus");
  const ap = value("#financialAp");
  const apLocalizada = ap ? "Sim" : "Não";

  return {
    licenseId: value("#financialLicense"),
    setor: "Sistemas e Projetos",
    categoria: value("#financialCategoria"),
    fornecedor: value("#financialFornecedor"),
    filial: value("#financialFilial"),
    nf: value("#financialNf"),
    boleto: Number(value("#financialBoleto")) || 0,
    dataEmissao: value("#financialDataEmissao"),
    dataVencimento: value("#financialDataVencimento"),
    status,
    observacoes: "",
    codFornecedor: value("#financialCodFornecedor"),
    nomeFornecedor: value("#financialNomeFornecedor"),
    ap,
    alerta: financialAlertLabel(value("#financialDataVencimento"), status),
    apLocalizada,
    motivoAlerta: financialReasonLabel(value("#financialDataVencimento"), status, apLocalizada),
    enviarAlerta: shouldSendFinancialAlert(value("#financialDataVencimento"), status) ? "Sim" : "Não"
  };
}

async function loadAccessUsers() {
  const data = await api("/api/access-users");
  state.accessUsers = data.accessUsers || [];
}

async function loadEmailSettings() {
  const data = await api("/api/settings/email");
  state.emailSettings = data.settings || {};
}

async function loadAuditLogs() {
  const data = await api("/api/audit-logs");
  state.auditLogs = data.auditLogs || [];
}

async function saveEmailSettings(event) {
  event.preventDefault();
  const settings = readEmailSettingsForm();
  await saveResource("/api/settings/email", "PUT", settings);
  els.emailSettingsStatus.textContent = "Configuracoes salvas.";
  await loadEmailSettings();
  await loadAuditLogs();
  fillEmailSettingsForm();
  renderAuditRows();
}

async function clearAuditLogs() {
  const confirmed = await confirmAction(
    "Limpar auditoria",
    "Deseja limpar todos os registros de auditoria? Esta acao nao pode ser desfeita.",
    "Limpar"
  );
  if (!confirmed) return;

  try {
    await api("/api/audit-logs", { method: "DELETE", body: "{}" });
    resetPagination("audit");
    await loadAuditLogs();
    renderAuditRows();
    alert("LOG de auditoria limpo com sucesso.");
  } catch (error) {
    alert(error.message);
  }
}

async function saveAccessUser(event) {
  event.preventDefault();
  const accessId = value("#accessId");
  const accessUser = {
    username: value("#accessUsername"),
    displayName: value("#accessDisplayName"),
    email: value("#accessEmail"),
    password: value("#accessPassword"),
    confirmPassword: value("#accessConfirmPassword"),
    role: value("#accessRole"),
    active: document.querySelector("#accessActive").checked
  };

  if (!accessId && !accessUser.password) {
    alert("Informe uma senha para o novo acesso.");
    return;
  }

  if (accessUser.password || accessUser.confirmPassword) {
    if (accessUser.password !== accessUser.confirmPassword) {
      alert("A confirmacao da senha nao confere.");
      return;
    }
  }

  await saveResource(
    accessId ? `/api/access-users/${accessId}` : "/api/access-users",
    accessId ? "PUT" : "POST",
    accessUser
  );
  closeEditDialog();
  clearAccessForm();
  await loadData();
}

async function saveAccount(event) {
  event.preventDefault();
  const newPassword = value("#accountNewPassword");
  const confirmPassword = value("#accountConfirmPassword");
  if (newPassword !== confirmPassword) {
    alert("A confirmacao da nova senha nao confere.");
    return;
  }

  try {
    const data = await api("/api/auth/me", {
      method: "PUT",
      body: JSON.stringify({
        username: value("#accountUsername"),
        displayName: value("#accountDisplayName"),
        currentPassword: value("#accountCurrentPassword"),
        newPassword
      })
    });
    currentUser = data.user;
    unlockApp();
    closeEditDialog();
    clearAccountPasswordFields();
    if (isAdmin()) await loadAccessUsers();
    renderAccessRows();
    alert("Conta atualizada com sucesso.");
  } catch (error) {
    alert(error.message);
  }
}

async function saveResource(url, method, body) {
  try {
    await api(url, {
      method,
      body: JSON.stringify(body)
    });
  } catch (error) {
    alert(error.message);
    throw error;
  }
}

function render() {
  setView(currentView);
  applyPermissions();
  renderDashboard();
  renderSoftwareOptions();
  renderLicenseRows();
  renderUserRows();
  renderAssignmentOptions();
  renderFinancialLicenseOptions();
  renderAssignmentRows();
  renderFinancialRows();
  renderReport();
  renderAccessRows();
  renderSettings();
  renderAuditRows();
  fillEmailSettingsForm();
  updateSortIndicators();
}

function setSettingsPane(pane) {
  settingsPane = pane;
  renderSettings();
  if (pane === "audit") {
    loadAuditLogs().then(renderAuditRows).catch((error) => alert(error.message));
  }
}

function renderSettings() {
  if (!isAdmin()) return;
  els.settingsEmailTab.classList.toggle("active", settingsPane === "email");
  els.settingsAuditTab.classList.toggle("active", settingsPane === "audit");
  els.settingsEmailPane.classList.toggle("active-settings-pane", settingsPane === "email");
  els.settingsAuditPane.classList.toggle("active-settings-pane", settingsPane === "audit");
}

function renderDashboard() {
  const softwareCount = softwareGroups().length;
  const linkableLicenses = state.licenses.filter((license) => !isSimultaneousLicense(license));
  const seats = linkableLicenses.reduce((total, license) => total + license.seats, 0);
  const inUse = state.assignments.filter((assignment) => {
    const license = getLicense(assignment.licenseId);
    return license && !isSimultaneousLicense(license) && isActiveAssignment(assignment);
  }).length;
  const expired = state.licenses.filter((license) => licenseStatus(license).code === "bad").length;

  setText("#metricSoftware", softwareCount);
  setText("#metricLicenses", state.licenses.length);
  setText("#metricInUse", inUse);
  setText("#metricAvailable", Math.max(0, seats - inUse));
  setText("#metricExpired", expired);

  const renewals = state.licenses
    .filter((license) => license.expiresAt)
    .map((license) => ({ license, days: daysUntil(license.expiresAt) }))
    .filter((item) => item.days <= 90)
    .sort((a, b) => a.days - b.days);

  setText("#renewalCount", `${renewals.length} itens`);
  document.querySelector("#renewalList").innerHTML = renewals.length
    ? renewals.map(({ license, days }) => `
        <article class="list-item">
          <div>
            <strong>${escapeHtml(license.software)}</strong>
            <span class="meta">${escapeHtml(license.key)} - ${dateLabel(license.expiresAt)}</span>
          </div>
          ${statusBadge(days < 0 ? "Vencida" : `${days} dias`, days < 0 ? "bad" : days <= 30 ? "warn" : "info")}
        </article>
      `).join("")
    : `<div class="empty">Nenhum vencimento nos proximos 90 dias.</div>`;

  document.querySelector("#usageList").innerHTML = state.licenses.length
    ? softwareGroups().map((group) => {
        const namedLicenses = group.licenses.filter((license) => !isSimultaneousLicense(license));
        const totalSeats = namedLicenses.reduce((total, license) => total + license.seats, 0);
        const used = namedLicenses.reduce((total, license) => total + activeAssignments(license.id).length, 0);
        const simultaneousSeats = group.licenses
          .filter(isSimultaneousLicense)
          .reduce((total, license) => total + license.seats, 0);
        const percent = totalSeats ? Math.min(100, Math.round((used / totalSeats) * 100)) : 0;
        const usageText = [
          totalSeats ? `${used} de ${totalSeats} em uso` : "",
          simultaneousSeats ? `${simultaneousSeats} usuarios simultaneos` : ""
        ].filter(Boolean).join(" - ");
        return `
          <article class="list-item">
            <div>
              <strong>${escapeHtml(group.name)}</strong>
              <span class="meta">${group.licenses.length} chaves - ${escapeHtml(usageText || "Sem capacidade informada")}</span>
            </div>
            <div class="bar ${used > totalSeats ? "over" : ""}"><span style="width:${percent}%"></span></div>
          </article>
        `;
      }).join("")
    : `<div class="empty">Cadastre chaves para visualizar o uso.</div>`;
}

function renderSoftwareOptions() {
  els.softwareOptions.innerHTML = softwareGroups()
    .map((group) => `<option value="${escapeHtml(group.name)}"></option>`)
    .join("");
}

function renderLicenseRows() {
  const licenses = sortTableItems("licenses", filtered(state.licenses, (license) => [
    license.software,
    license.vendor,
    license.type,
    license.key,
    license.supplier
  ]).filter(matchesLicenseQuickFilter));
  const page = paginateItems("licenses", licenses);
  const rows = groupedLicenseRows(page.items);

  els.licenseRows.innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="6"><div class="empty">Nenhuma chave encontrada.</div></td></tr>`;
  renderPagination("licenses", page, els.licensePagination, renderLicenseRows);
}

function matchesLicenseQuickFilter(license) {
  if (licenseQuickFilter === "expired") {
    return licenseStatus(license).code === "bad";
  }
  if (licenseQuickFilter === "available") {
    if (isSimultaneousLicense(license)) return true;
    return Math.max(0, license.seats - activeAssignments(license.id).length) > 0;
  }
  return true;
}

function groupedLicenseRows(licenses) {
  return groupLicensesForTable(licenses).flatMap((group) => {
    if (group.licenses.length === 1) return [renderSingleLicenseRow(group.licenses[0])];
    return renderMultiLicenseGroup(group);
  });
}

function renderMultiLicenseGroup(group) {
  const isExpanded = expandedMultiLicenseSoftware.has(group.name);
  const encodedName = encodeURIComponent(group.name);
  const nextExpiration = group.licenses
    .filter((license) => license.expiresAt)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))[0]?.expiresAt || "";
  const groupStatus = group.licenses.some((license) => licenseStatus(license).code === "bad")
    ? { label: "Possui vencida", code: "bad" }
    : group.licenses.some((license) => licenseStatus(license).code === "warn")
      ? { label: "A vencer", code: "warn" }
      : { label: "Regular", code: "ok" };

  return [
    `
      <tr class="license-group-row">
        <td>
          <button class="group-toggle" type="button" onclick="toggleLicenseGroup('${encodedName}')" title="${isExpanded ? "Recolher licencas" : "Expandir licencas"}">
            ${isExpanded ? "-" : "+"}
          </button>
          <strong>${escapeHtml(group.name)}</strong>
          <div class="meta">${group.licenses.length} licencas cadastradas</div>
        </td>
        <td>${escapeHtml(uniqueValues(group.licenses.map((license) => license.type)).join(", "))}</td>
        <td>${licenseGroupUsageLabel(group.licenses)}</td>
        <td>${dateLabel(nextExpiration)}</td>
        <td>${statusBadge(groupStatus.label, groupStatus.code)}</td>
        <td>
          <div class="row-actions">
            <button class="small-action" type="button" title="Nova chave para este software" onclick="newKeyForSoftware('${group.licenses[0].id}')">+</button>
          </div>
        </td>
      </tr>
    `,
    ...(isExpanded ? group.licenses.map(renderLicenseDetailRow) : [])
  ];
}

function renderSingleLicenseRow(license) {
  const status = licenseStatus(license);
  return `
    <tr>
      <td><strong>${escapeHtml(license.software)}</strong><div class="meta">${escapeHtml(license.key)} - ${escapeHtml(license.vendor)}</div></td>
      <td>${escapeHtml(license.type)}</td>
      <td>${licenseUsageLabel(license)}</td>
      <td>${dateLabel(license.expiresAt)}</td>
      <td>${statusBadge(status.label, status.code)}</td>
      <td>${rowActions("license", license.id)}</td>
    </tr>
  `;
}

function renderLicenseDetailRow(license) {
  const status = licenseStatus(license);
  return `
    <tr class="license-detail-row">
      <td><strong>${escapeHtml(license.key || "Sem serial")}</strong><div class="meta">${escapeHtml(license.vendor || license.software)} - ${escapeHtml(license.supplier)}</div></td>
      <td>${escapeHtml(license.type)}</td>
      <td>${licenseUsageLabel(license)}</td>
      <td>${dateLabel(license.expiresAt)}</td>
      <td>${statusBadge(status.label, status.code)}</td>
      <td>${rowActions("license", license.id)}</td>
    </tr>
  `;
}

function renderUserRows() {
  const users = sortTableItems("users", filtered(state.users, (user) => [user.name, user.email, user.department, user.device, user.status]));
  const page = paginateItems("users", users);
  setText("#userCount", `${state.users.length} usuarios`);

  els.userRows.innerHTML = page.items.length
    ? page.items.map((user) => {
        const count = state.assignments.filter((item) => {
          const license = getLicense(item.licenseId);
          return license && !isSimultaneousLicense(license) && item.userId === user.id && isActiveAssignment(item);
        }).length;
        return `
          <tr>
            <td><strong>${escapeHtml(user.name)}</strong><div class="meta">${escapeHtml(user.status)}</div></td>
            <td>${escapeHtml(user.email)}</td>
            <td>${escapeHtml(user.department)}</td>
            <td>${count}</td>
            <td>${rowActions("user", user.id)}</td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="5"><div class="empty">Nenhum usuario encontrado.</div></td></tr>`;
  renderPagination("users", page, els.userPagination, renderUserRows);
}

function renderAssignmentOptions() {
  const linkableGroups = softwareGroups()
    .map((group) => ({
      ...group,
      licenses: group.licenses.filter((license) => !isSimultaneousLicense(license))
    }))
    .filter((group) => group.licenses.length);

  els.assignmentLicense.innerHTML = linkableGroups.length
    ? linkableGroups.map((group) => `
        <optgroup label="${escapeHtml(group.name)}">
          ${group.licenses.map((license) => {
            const used = activeAssignments(license.id).length;
            return `<option value="${license.id}">${escapeHtml(license.key)} - ${used}/${license.seats} em uso</option>`;
          }).join("")}
        </optgroup>
      `).join("")
    : `<option value="">Cadastre uma chave que permita vinculo</option>`;

  els.assignmentUser.innerHTML = state.users.length
    ? state.users.map((user) => `<option value="${user.id}">${escapeHtml(user.name)} - ${escapeHtml(user.email)}</option>`).join("")
    : `<option value="">Cadastre um usuario</option>`;
}

function renderFinancialLicenseOptions() {
  els.financialLicense.innerHTML = `<option value="">Sem vinculo</option>` + (
    state.licenses.length
      ? softwareGroups().map((group) => `
          <optgroup label="${escapeHtml(group.name)}">
            ${group.licenses.map((license) => `<option value="${license.id}">${escapeHtml(license.key)} - ${escapeHtml(license.type)}</option>`).join("")}
          </optgroup>
        `).join("")
      : ""
  );
}

function renderAssignmentRows() {
  const assignments = filtered(state.assignments, (assignment) => {
    const license = getLicense(assignment.licenseId) || {};
    const user = getUser(assignment.userId) || {};
    return [license.software, license.key, user.name, user.email, assignment.status, assignment.notes];
  }).filter((assignment) => {
    const license = getLicense(assignment.licenseId);
    return license && !isSimultaneousLicense(license) && matchesAssignmentQuickFilter(assignment);
  });
  const groups = groupAssignmentsForTable(assignments);
  const page = paginateItems("assignments", groups);
  const rows = page.items.flatMap((group) => {
    if (group.assignments.length === 1) return [renderSingleAssignmentRow(group.assignments[0])];
    return renderMultiAssignmentGroup(group);
  });

  setText("#assignmentCount", `${state.assignments.filter((assignment) => {
    const license = getLicense(assignment.licenseId);
    return license && !isSimultaneousLicense(license) && isActiveAssignment(assignment);
  }).length} vinculos`);
  els.assignmentRows.innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="6"><div class="empty">Nenhum vinculo encontrado.</div></td></tr>`;
  renderPagination("assignments", page, els.assignmentPagination, renderAssignmentRows);
}

function matchesAssignmentQuickFilter(assignment) {
  if (assignmentQuickFilter === "active") return isActiveAssignment(assignment);
  return true;
}

function groupedAssignmentRows(assignments) {
  return groupAssignmentsForTable(assignments).flatMap((group) => {
    if (group.assignments.length === 1) return [renderSingleAssignmentRow(group.assignments[0])];
    return renderMultiAssignmentGroup(group);
  });
}

function renderSingleAssignmentRow(assignment) {
  const license = getLicense(assignment.licenseId) || {};
  const user = getUser(assignment.userId) || {};
  return `
    <tr>
      <td><strong>${escapeHtml(user.name || "Usuario removido")}</strong><div class="meta">${escapeHtml(user.email || "")}</div></td>
      <td>${escapeHtml(license.software || "Chave removida")}</td>
      <td>${escapeHtml(license.key || "")}</td>
      <td>${dateLabel(assignment.startDate)}</td>
      <td>${statusBadge(assignment.status, assignmentStatusCode(assignment))}</td>
      <td>${rowActions("assignment", assignment.id)}</td>
    </tr>
  `;
}

function renderMultiAssignmentGroup(group) {
  const isExpanded = expandedAssignmentSoftware.has(group.name);
  const encodedName = encodeURIComponent(group.name);
  const activeCount = group.assignments.filter(isActiveAssignment).length;
  const users = uniqueValues(group.assignments.map((assignment) => getUser(assignment.userId)?.name || "Usuario removido"));
  const keys = uniqueValues(group.assignments.map((assignment) => getLicense(assignment.licenseId)?.key || ""));
  const groupStatus = activeCount
    ? { label: `${activeCount} ativos`, code: "ok" }
    : { label: "Sem uso ativo", code: "warn" };

  return [
    `
      <tr class="assignment-group-row">
        <td>
          <button class="group-toggle" type="button" onclick="toggleAssignmentGroup('${encodedName}')" title="${isExpanded ? "Recolher vinculos" : "Expandir vinculos"}">
            ${isExpanded ? "-" : "+"}
          </button>
          <strong>${escapeHtml(group.name)}</strong>
          <div class="meta">${group.assignments.length} vinculos cadastrados</div>
        </td>
        <td>${escapeHtml(users.length)} usuarios</td>
        <td>${escapeHtml(keys.length || group.assignments.length)} chaves</td>
        <td>${dateLabel(nextAssignmentStartDate(group.assignments))}</td>
        <td>${statusBadge(groupStatus.label, groupStatus.code)}</td>
        <td></td>
      </tr>
    `,
    ...(isExpanded ? group.assignments.map(renderAssignmentDetailRow) : [])
  ];
}

function renderAssignmentDetailRow(assignment) {
  const license = getLicense(assignment.licenseId) || {};
  const user = getUser(assignment.userId) || {};
  return `
    <tr class="assignment-detail-row">
      <td><strong>${escapeHtml(user.name || "Usuario removido")}</strong><div class="meta">${escapeHtml(user.email || "")}</div></td>
      <td>${escapeHtml(license.software || "Chave removida")}</td>
      <td>${escapeHtml(license.key || "")}</td>
      <td>${dateLabel(assignment.startDate)}</td>
      <td>${statusBadge(assignment.status, assignmentStatusCode(assignment))}</td>
      <td>${rowActions("assignment", assignment.id)}</td>
    </tr>
  `;
}

function nextAssignmentStartDate(assignments) {
  return assignments
    .map((assignment) => assignment.startDate)
    .filter(Boolean)
    .sort()[0] || "";
}

function renderFinancialRows() {
  renderFinancialControls();
  const baseItems = getFinancialBaseItems();
  const items = sortTableItems("financial", filtered(baseItems, (item) => [
    item.setor,
    item.categoria,
    item.fornecedor,
    item.nf,
    item.status,
    item.ap,
    item.motivoAlerta
  ]));
  const page = paginateItems("financial", items);
  const total = baseItems.reduce((sum, item) => sum + (Number(item.boleto) || 0), 0);
  const pending = baseItems.filter((item) => normalizeText(item.status) && normalizeText(item.status) !== "pago").length;
  const expired = baseItems.filter((item) => item.dataVencimento && daysUntil(item.dataVencimento) < 0 && !isPaidStatus(item.status)).length;
  const noAp = baseItems.filter((item) => normalizeText(item.apLocalizada) === "nao" || normalizeText(item.apLocalizada) === "não").length;

  setText("#metricBills", baseItems.length);
  setText("#metricBillAmount", money(total));
  setText("#metricBillPending", pending);
  setText("#metricBillExpired", expired);
  setText("#metricBillNoAp", noAp);
  setText("#financialCount", `${baseItems.length} itens`);
  setMetricActive("#metricBills", false);
  setMetricActive("#metricBillAmount", false);
  setMetricActive("#metricBillPending", financialQuickFilter === "pending");
  setMetricActive("#metricBillExpired", financialQuickFilter === "expired");
  setMetricActive("#metricBillNoAp", financialQuickFilter === "noAp");

  els.financialRows.innerHTML = page.items.length
    ? page.items.map((item) => `
        <tr class="${financialDueClass(item)}">
          <td><strong>${escapeHtml(item.fornecedor)}</strong><div class="meta">${escapeHtml(item.categoria || item.setor)}</div></td>
          <td>${escapeHtml(financialSupplierLabel(item))}</td>
          <td>${escapeHtml(item.nf)}</td>
          <td>${money(item.boleto)}</td>
          <td>${dateLabel(item.dataVencimento)}</td>
          <td>${statusBadge(item.status || "Sem status", financialStatusCode(item))}</td>
          <td>${escapeHtml(item.ap)}</td>
          <td>${escapeHtml(item.filial)}</td>
          <td>${escapeHtml(financialLicenseLabel(item.licenseId))}</td>
          <td>${escapeHtml(item.motivoAlerta)}</td>
          <td>${rowActions("financial", item.id)}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="11"><div class="empty">Nenhum item financeiro importado.</div></td></tr>`;
  renderPagination("financial", page, els.financialPagination, renderFinancialRows);
}

function financialDueClass(item) {
  if (!item.dataVencimento || isPaidStatus(item.status)) return "";
  const days = daysUntil(item.dataVencimento);
  if (days < 0) return "financial-overdue";
  if (days <= 10) return "financial-due-soon";
  return "";
}

function setMetricActive(selector, isActive) {
  document.querySelector(selector)?.closest(".metric")?.classList.toggle("active-filter", isActive);
}

function renderFinancialControls() {
  const options = financialFilterType === "vencimento" ? [] : uniqueFinancialFilterOptions(financialFilterType);
  if (financialMode === "filtered" && financialFilterType !== "vencimento" && !financialFilter && options.length) {
    financialFilter = options[0];
  }
  if (financialFilterType !== "vencimento" && financialFilter && !options.includes(financialFilter)) {
    financialFilter = options[0] || "";
  }

  els.financialAllMode.classList.toggle("active", financialMode === "all");
  els.financialFilteredMode.classList.toggle("active", financialMode === "filtered");
  els.financialFilterType.hidden = financialMode !== "filtered";
  els.financialValueFilter.hidden = financialMode !== "filtered" || financialFilterType === "vencimento";
  els.financialDateRangeFilter.hidden = financialMode !== "filtered" || financialFilterType !== "vencimento";
  els.financialFilterType.value = financialFilterType;
  els.financialValueFilter.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
    .join("");
  els.financialValueFilter.value = financialFilter;
  els.financialDateFromFilter.value = financialDateFromFilter;
  els.financialDateToFilter.value = financialDateToFilter;
}

function setFinancialMode(mode) {
  financialMode = mode;
  financialQuickFilter = "";
  resetPagination("financial");
  if (mode === "all") {
    financialFilter = "";
    financialDateFromFilter = "";
    financialDateToFilter = "";
  }
  renderFinancialRows();
}

function getFinancialBaseItems() {
  let items = state.financialItems;

  if (financialMode === "filtered" && financialFilterType === "software") {
    if (financialFilter) items = items.filter((item) => item.fornecedor === financialFilter);
  }
  if (financialMode === "filtered" && financialFilterType === "filial") {
    if (financialFilter) items = items.filter((item) => item.filial === financialFilter);
  }
  if (financialMode === "filtered" && financialFilterType === "status") {
    if (financialFilter) items = items.filter((item) => (item.status || "Sem status") === financialFilter);
  }
  if (financialMode === "filtered" && financialFilterType === "vencimento") {
    items = items.filter((item) => {
      if (!item.dataVencimento) return false;
      if (financialDateFromFilter && item.dataVencimento < financialDateFromFilter) return false;
      if (financialDateToFilter && item.dataVencimento > financialDateToFilter) return false;
      return true;
    });
  }

  return items.filter(matchesFinancialQuickFilter);
}

function matchesFinancialQuickFilter(item) {
  if (financialQuickFilter === "pending") {
    return normalizeText(item.status) === "aguardando pagamento";
  }
  if (financialQuickFilter === "expired") {
    return item.dataVencimento && daysUntil(item.dataVencimento) < 0 && !isPaidStatus(item.status);
  }
  if (financialQuickFilter === "noAp") {
    const apStatus = normalizeText(item.apLocalizada);
    return apStatus === "nao" || apStatus === "não" || apStatus === "nÃ£o";
  }
  return true;
}

function renderReport() {
  renderReportFilters();
  const report = buildCurrentReport();
  const totalValue = report.rows.reduce((sum, row) => sum + (Number(row.valor) || 0), 0);

  els.reportTitle.textContent = report.title;
  els.reportBody.innerHTML = `
    <div class="report-grid">
      <div class="report-box"><span class="meta">Registros</span><h2>${report.rows.length}</h2></div>
      <div class="report-box"><span class="meta">Softwares</span><h2>${new Set(report.rows.map((row) => row.software).filter(Boolean)).size}</h2></div>
      <div class="report-box"><span class="meta">Usuarios</span><h2>${new Set(report.rows.map((row) => row.usuario).filter(Boolean)).size}</h2></div>
      <div class="report-box"><span class="meta">Vencidos</span><h2>${report.rows.filter((row) => row.vencimento && daysUntil(row.vencimento) < 0 && !isPaidStatus(row.status)).length}</h2></div>
      <div class="report-box"><span class="meta">Valor</span><h2>${money(totalValue)}</h2></div>
    </div>
    ${reportTable(report)}
  `;
}

function renderReportFilters() {
  const current = readReportFilters();
  fillReportSelect(els.reportSoftware, uniqueReportValues("software"), current.software);
  fillReportSelect(els.reportUser, uniqueReportValues("usuario"), current.user);
  fillReportSelect(els.reportStatus, uniqueReportValues("status"), current.status);
  fillReportSelect(els.reportFilial, uniqueReportValues("filial"), current.filial);
}

function readReportFilters() {
  return {
    type: els.reportType.value || "licenses",
    software: els.reportSoftware.value || "",
    user: els.reportUser.value || "",
    status: els.reportStatus.value || "",
    filial: els.reportFilial.value || "",
    dueFrom: els.reportDueFrom.value || "",
    dueTo: els.reportDueTo.value || ""
  };
}

function fillReportSelect(select, values, selected) {
  const options = ["", ...values];
  select.innerHTML = options
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value || "Todos")}</option>`)
    .join("");
  select.value = options.includes(selected) ? selected : "";
}

function uniqueReportValues(field) {
  return Array.from(new Set(
    reportSourceRows()
      .map((row) => row[field])
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
}

function buildCurrentReport() {
  const filters = readReportFilters();
  const titles = {
    licenses: "Relatorio de licencas",
    users: "Relatorio de usuarios",
    assignments: "Relatorio de vinculos",
    financial: "Relatorio financeiro"
  };
  const rows = reportSourceRows(filters.type).filter((row) => reportRowMatches(row, filters));
  return { title: titles[filters.type], rows, columns: reportColumns(filters.type), type: filters.type };
}

function reportSourceRows(type = els.reportType.value || "licenses") {
  if (type === "users") {
    return state.users.map((user) => ({
      usuario: user.name,
      email: user.email,
      departamento: user.department,
      status: user.status,
      software: "",
      filial: "",
      vencimento: ""
    }));
  }

  if (type === "assignments") {
    return state.assignments.filter((assignment) => {
      const license = getLicense(assignment.licenseId);
      return license && !isSimultaneousLicense(license);
    }).map((assignment) => {
      const user = getUser(assignment.userId) || {};
      const license = getLicense(assignment.licenseId) || {};
      return {
        usuario: user.name || "",
        email: user.email || "",
        departamento: user.department || "",
        software: license.software || "",
        chave: license.key || "",
        tipo: license.type || "",
        inicio: assignment.startDate || "",
        devolucao: assignment.returnDate || "",
        status: assignment.status || "",
        filial: "",
        vencimento: license.expiresAt || ""
      };
    });
  }

  if (type === "financial") {
    return state.financialItems.map((item) => ({
      software: item.fornecedor,
      filial: item.filial,
      nf: item.nf,
      ap: item.ap,
      status: item.status,
      vencimento: item.dataVencimento,
      valor: item.boleto,
      alerta: item.motivoAlerta
    }));
  }

  return state.licenses.map((license) => ({
    software: license.software,
    fabricante: license.vendor,
    chave: license.key,
    tipo: license.type,
    quantidade: license.seats,
    vencimento: license.expiresAt,
    fornecedor: license.supplier,
    status: licenseStatus(license).label,
    usuario: "",
    filial: ""
  }));
}

function reportRowMatches(row, filters) {
  if (filters.software && row.software !== filters.software) return false;
  if (filters.user && row.usuario !== filters.user) return false;
  if (filters.status && row.status !== filters.status) return false;
  if (filters.filial && row.filial !== filters.filial) return false;
  if (filters.type !== "users" && filters.dueFrom && (!row.vencimento || row.vencimento < filters.dueFrom)) return false;
  if (filters.type !== "users" && filters.dueTo && (!row.vencimento || row.vencimento > filters.dueTo)) return false;
  return true;
}

function reportColumns(type) {
  return {
    licenses: ["software", "fabricante", "chave", "tipo", "quantidade", "vencimento", "fornecedor", "status"],
    users: ["usuario", "email", "departamento", "status"],
    assignments: ["usuario", "email", "departamento", "software", "chave", "tipo", "inicio", "devolucao", "status", "vencimento"],
    financial: ["software", "filial", "nf", "ap", "status", "vencimento", "valor", "alerta"]
  }[type];
}

function reportTable(report) {
  if (!report.rows.length) return `<div class="empty">Nenhum registro encontrado para os filtros selecionados.</div>`;
  return `
    <div class="table-wrap report-table">
      <table>
        <thead><tr>${report.columns.map((column) => `<th>${escapeHtml(reportColumnLabel(column))}</th>`).join("")}</tr></thead>
        <tbody>
          ${report.rows.map((row) => `
            <tr>${report.columns.map((column) => `<td>${escapeHtml(reportCell(row, column))}</td>`).join("")}</tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function paginateItems(table, items) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  pagination[table] = Math.min(Math.max(1, pagination[table] || 1), totalPages);
  const page = pagination[table];
  const start = (page - 1) * PAGE_SIZE;
  return {
    items: items.slice(start, start + PAGE_SIZE),
    page,
    totalPages,
    totalItems: items.length,
    start: items.length ? start + 1 : 0,
    end: Math.min(start + PAGE_SIZE, items.length)
  };
}

function renderPagination(table, page, container, renderFn) {
  if (!container) return;
  if (page.totalItems <= PAGE_SIZE) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <span>${page.start}-${page.end} de ${page.totalItems}</span>
    <button type="button" ${page.page <= 1 ? "disabled" : ""}>Anterior</button>
    <span>Pagina ${page.page} de ${page.totalPages}</span>
    <button type="button" ${page.page >= page.totalPages ? "disabled" : ""}>Proxima</button>
  `;
  const [previousButton, nextButton] = container.querySelectorAll("button");
  previousButton.addEventListener("click", () => {
    pagination[table] = Math.max(1, page.page - 1);
    renderFn();
  });
  nextButton.addEventListener("click", () => {
    pagination[table] = Math.min(page.totalPages, page.page + 1);
    renderFn();
  });
}

function resetPagination(table) {
  if (table) {
    pagination[table] = 1;
    return;
  }
  Object.keys(pagination).forEach((key) => {
    pagination[key] = 1;
  });
}

function renderAccessRows() {
  if (!isAdmin()) return;
  setText("#accessCount", `${state.accessUsers.length} acessos`);
  const users = sortTableItems("access", state.accessUsers);
  const page = paginateItems("access", users);
  els.accessRows.innerHTML = page.items.length
    ? page.items.map((user) => `
        <tr>
          <td><strong>${escapeHtml(user.username)}</strong></td>
          <td>${escapeHtml(user.displayName)}</td>
          <td>${escapeHtml(user.email || "")}</td>
          <td>${escapeHtml(roleLabel(user.role))}</td>
          <td>${statusBadge(user.active ? "Ativo" : "Inativo", user.active ? "ok" : "warn")}</td>
          <td>${rowActions("access", user.id)}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="6"><div class="empty">Nenhum acesso encontrado.</div></td></tr>`;
  renderPagination("access", page, els.accessPagination, renderAccessRows);
}

function renderAuditRows() {
  if (!isAdmin() || !els.auditRows) return;
  setText("#auditCount", `${state.auditLogs.length} registros`);
  const page = paginateItems("audit", state.auditLogs);
  els.auditRows.innerHTML = page.items.length
    ? page.items.map((log) => `
        <tr>
          <td>${escapeHtml(log.createdAt)}</td>
          <td><strong>${escapeHtml(log.displayName || log.username || "-")}</strong><div class="meta">${escapeHtml(log.username || "")}</div></td>
          <td>${escapeHtml(log.action)}</td>
          <td>${escapeHtml(log.entity)}</td>
          <td>${escapeHtml(log.details || log.entityId || "")}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="5"><div class="empty">Nenhum registro de auditoria encontrado.</div></td></tr>`;
  renderPagination("audit", page, els.auditPagination, renderAuditRows);
}

function rowActions(type, idValue) {
  if (!canManageData()) return "";
  if (type === "access" && !isAdmin()) return "";
  if (!canModifyRecord(type, idValue)) return "";
  const deleteButton = canModifyRecord(type, idValue)
    ? `<button class="small-action" type="button" title="Excluir" onclick="deleteItem('${type}','${idValue}')">X</button>`
    : "";

  if (type === "license") {
    return `
      <div class="row-actions">
        <button class="small-action" type="button" title="Nova chave para este software" onclick="newKeyForSoftware('${idValue}')">+</button>
        <button class="small-action" type="button" title="Editar" onclick="editItem('${type}','${idValue}')">✎</button>
        ${deleteButton}
      </div>
    `;
  }

  return `
    <div class="row-actions">
      <button class="small-action" type="button" title="Editar" onclick="editItem('${type}','${idValue}')">✎</button>
      ${deleteButton}
    </div>
  `;
}

function newLicense() {
  clearLicenseForm();
  openEditDialog(els.licenseForm, "Nova chave");
}

function newUser() {
  clearUserForm();
  openEditDialog(els.userForm, "Novo usuario");
}

function newAssignment() {
  clearAssignmentForm();
  openEditDialog(els.assignmentForm, "Novo vinculo");
}

function newFinancial() {
  clearFinancialForm();
  openEditDialog(els.financialForm, "Novo boleto");
}

function newAccess() {
  clearAccessForm();
  openEditDialog(els.accessForm, "Novo acesso");
}

function openAccount() {
  if (!currentUser) return;
  setFormValues({
    "#accountUsername": currentUser.username || "",
    "#accountDisplayName": currentUser.displayName || "",
    "#accountCurrentPassword": "",
    "#accountNewPassword": "",
    "#accountConfirmPassword": ""
  });
  openEditDialog(els.accountForm, "Minha conta");
}

function newKeyForSoftware(idValue) {
  const item = state.licenses.find((entry) => entry.id === idValue);
  if (!item) return;
  setFormValues({
    "#licenseId": "",
    "#software": item.software,
    "#vendor": item.vendor,
    "#licenseType": item.type,
    "#licenseKey": "",
    "#seats": "1",
    "#expiresAt": item.expiresAt,
    "#supplier": item.supplier,
    "#licenseNotes": ""
  });
  openEditDialog(els.licenseForm, "Nova chave");
  document.querySelector("#licenseKey").focus();
}

function toggleLicenseGroup(encodedName) {
  const name = decodeURIComponent(encodedName);
  if (expandedMultiLicenseSoftware.has(name)) {
    expandedMultiLicenseSoftware.delete(name);
  } else {
    expandedMultiLicenseSoftware.add(name);
  }
  renderLicenseRows();
}

function toggleAssignmentGroup(encodedName) {
  const name = decodeURIComponent(encodedName);
  if (expandedAssignmentSoftware.has(name)) {
    expandedAssignmentSoftware.delete(name);
  } else {
    expandedAssignmentSoftware.add(name);
  }
  renderAssignmentRows();
}

function editItem(type, idValue) {
  if (!canModifyRecord(type, idValue)) {
    alert("Voce so pode editar informacoes cadastradas por voce.");
    return;
  }

  if (type === "license") {
    const item = state.licenses.find((entry) => entry.id === idValue);
    setFormValues({
      "#licenseId": item.id,
      "#software": item.software,
      "#vendor": item.vendor,
      "#licenseType": item.type,
      "#licenseKey": item.key,
      "#seats": item.seats,
      "#expiresAt": item.expiresAt,
      "#supplier": item.supplier,
      "#licenseNotes": item.notes
    });
    openEditDialog(els.licenseForm, "Editar chave");
  }

  if (type === "user") {
    const item = state.users.find((entry) => entry.id === idValue);
    setFormValues({
      "#userId": item.id,
      "#userName": item.name,
      "#email": item.email,
      "#department": item.department,
      "#device": item.device,
      "#userStatus": item.status
    });
    openEditDialog(els.userForm, "Editar usuario");
  }

  if (type === "assignment") {
    const item = state.assignments.find((entry) => entry.id === idValue);
    setFormValues({
      "#assignmentId": item.id,
      "#assignmentLicense": item.licenseId,
      "#assignmentUser": item.userId,
      "#startDate": item.startDate,
      "#returnDate": item.returnDate,
      "#assignmentStatus": item.status,
      "#assignmentNotes": item.notes
    });
    openEditDialog(els.assignmentForm, "Editar vinculo");
  }

  if (type === "financial") {
    const item = state.financialItems.find((entry) => entry.id === idValue);
    setFormValues({
      "#financialId": item.id,
      "#financialFornecedor": item.fornecedor,
      "#financialCategoria": item.categoria,
      "#financialFilial": item.filial,
      "#financialNf": item.nf,
      "#financialCodFornecedor": item.codFornecedor,
      "#financialNomeFornecedor": item.nomeFornecedor,
      "#financialBoleto": item.boleto,
      "#financialDataEmissao": item.dataEmissao,
      "#financialDataVencimento": item.dataVencimento,
      "#financialStatus": item.status || "Aguardando Pagamento",
      "#financialAp": item.ap,
      "#financialLicense": item.licenseId || ""
    });
    openEditDialog(els.financialForm, "Editar boleto");
  }

  if (type === "access") {
    const item = state.accessUsers.find((entry) => entry.id === idValue);
    setFormValues({
      "#accessId": item.id,
      "#accessUsername": item.username,
      "#accessDisplayName": item.displayName,
      "#accessEmail": item.email || "",
      "#accessPassword": "",
      "#accessConfirmPassword": "",
      "#accessRole": item.role
    });
    document.querySelector("#accessActive").checked = item.active;
    openEditDialog(els.accessForm, "Editar acesso");
  }
}

async function deleteItem(type, idValue) {
  if (!canModifyRecord(type, idValue)) {
    alert("Voce so pode excluir informacoes cadastradas por voce.");
    return;
  }

  const title = { license: "Excluir chave", user: "Excluir usuario", assignment: "Excluir vinculo", financial: "Excluir boleto", access: "Excluir acesso" }[type];
  const text = type === "license"
    ? "Os vinculos desta chave tambem serao removidos."
    : type === "user"
      ? "Os vinculos deste usuario tambem serao removidos."
      : type === "access"
        ? "Este usuario nao podera mais entrar no sistema."
        : type === "financial"
          ? "Este item financeiro sera removido."
        : "Este vinculo sera removido.";

  const confirmed = await confirmAction(title, text, "Excluir");
  if (!confirmed) return;

  const urls = {
    license: `/api/licenses/${idValue}`,
    user: `/api/users/${idValue}`,
    assignment: `/api/assignments/${idValue}`,
    financial: `/api/financial-items/${idValue}`,
    access: `/api/access-users/${idValue}`
  };

  try {
    await api(urls[type], { method: "DELETE" });
    await loadData();
  } catch (error) {
    alert(error.message);
  }
}

function confirmAction(title, text, okLabel = "Confirmar") {
  const dialog = document.querySelector("#confirmDialog");
  document.querySelector("#confirmTitle").textContent = title;
  document.querySelector("#confirmText").textContent = text;
  document.querySelector("#confirmOk").textContent = okLabel;
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true });
  });
}

function clearLicenseForm() {
  els.licenseForm.reset();
  setValue("#licenseId", "");
  setValue("#seats", "1");
}

function clearUserForm() {
  els.userForm.reset();
  setValue("#userId", "");
}

function clearAssignmentForm() {
  els.assignmentForm.reset();
  setValue("#assignmentId", "");
  setValue("#startDate", today());
  els.capacityWarning.hidden = true;
}

function clearFinancialForm() {
  els.financialForm.reset();
  setValue("#financialId", "");
  setValue("#financialLicense", "");
  setValue("#financialCodFornecedor", "");
  setValue("#financialNomeFornecedor", "");
  setValue("#financialFilial", "");
  setValue("#financialStatus", "Aguardando Pagamento");
}

function clearAccessForm() {
  els.accessForm.reset();
  setValue("#accessId", "");
  setValue("#accessEmail", "");
  setValue("#accessConfirmPassword", "");
  document.querySelector("#accessActive").checked = true;
}

function clearAccountPasswordFields() {
  setValue("#accountCurrentPassword", "");
  setValue("#accountNewPassword", "");
  setValue("#accountConfirmPassword", "");
}

function fillEmailSettingsForm() {
  if (!isAdmin() || !state.emailSettings) return;
  const settings = state.emailSettings;
  setValue("#emailProvider", settings.emailProvider || "graph");
  setValue("#smtpHost", settings.smtpHost || "");
  setValue("#smtpPort", settings.smtpPort || "587");
  setValue("#smtpSecure", settings.smtpSecure || "false");
  setValue("#smtpUser", settings.smtpUser || "");
  setValue("#smtpPassword", settings.smtpPassword || "");
  setValue("#graphTenantId", settings.graphTenantId || "");
  setValue("#graphClientId", settings.graphClientId || "");
  setValue("#graphClientSecret", settings.graphClientSecret || "");
  setValue("#alertEmailFrom", settings.alertEmailFrom || "");
  setValue("#alertEmailTo", settings.alertEmailTo || "");
  setValue("#alertEmailTime", settings.alertEmailTime || "08:00");
  document.querySelector("#alertEmailEnabled").checked = String(settings.alertEmailEnabled || "") === "true";
  toggleEmailProviderFields();
}

function readEmailSettingsForm() {
  return {
    emailProvider: value("#emailProvider"),
    smtpHost: value("#smtpHost"),
    smtpPort: value("#smtpPort"),
    smtpSecure: value("#smtpSecure") === "true",
    smtpUser: value("#smtpUser"),
    smtpPassword: value("#smtpPassword"),
    graphTenantId: value("#graphTenantId"),
    graphClientId: value("#graphClientId"),
    graphClientSecret: value("#graphClientSecret"),
    alertEmailFrom: value("#alertEmailFrom"),
    alertEmailTo: value("#alertEmailTo"),
    alertEmailEnabled: document.querySelector("#alertEmailEnabled").checked,
    alertEmailTime: value("#alertEmailTime")
  };
}

function toggleEmailProviderFields() {
  const useGraph = value("#emailProvider") === "graph";
  document.querySelectorAll(".graph-email-field").forEach((field) => {
    field.hidden = !useGraph;
  });
  document.querySelectorAll(".smtp-email-field").forEach((field) => {
    field.hidden = useGraph;
  });
}

async function addSampleData() {
  if (state.licenses.length || state.users.length || state.assignments.length) return;
  try {
    await api("/api/sample-data", { method: "POST", body: "{}" });
    await loadData();
  } catch (error) {
    alert(error.message);
  }
}

const TEMPLATE_OPTIONS = {
  licenseTypes: ["Serial", "Usuarios nomeados", "Usuarios simultaneos", "Assinatura", "Perpetua"],
  userStatus: ["Ativo", "Inativo", "Terceiro"],
  assignmentStatus: ["Em uso", "Reservada", "Devolvida", "Bloqueada"],
  financialStatus: ["Aguardando Pagamento", "Pago", "Em aberto", "Cancelado"],
  yesNo: ["Sim", "Não"]
};

function downloadLicenseTemplate() {
  const rows = [
    ["software", "vendor", "type", "key", "seats", "expiresAt", "supplier", "notes"],
    ["AutoCAD", "Autodesk", "Serial", "ACD-2026-001", "1", "2026-12-31", "Revenda CAD", "Exemplo de chave individual"],
    ["AutoCAD", "Autodesk", "Usuarios nomeados", "ACD-2026-002", "3", "2026-12-31", "Revenda CAD", "Mesmo software com outra chave"],
    ["Microsoft 365", "Microsoft", "Assinatura", "M365-BUS-010", "10", "2027-05-30", "Portal Microsoft", "Exemplo de licenca por quantidade"]
  ];
  downloadTemplateWorkbook("modelo_importacao_licencas.xlsx", rows, {
    C: TEMPLATE_OPTIONS.licenseTypes
  });
}

function downloadUserTemplate() {
  const rows = [
    ["name", "email", "department", "device", "status"],
    ["Ana Silva", "ana.silva@empresa.com", "Projetos", "Notebook AN-014", "Ativo"],
    ["Carlos Souza", "carlos.souza@empresa.com", "Engenharia", "Desktop EN-021", "Ativo"],
    ["Mariana Lima", "mariana.lima@empresa.com", "Financeiro", "", "Terceiro"]
  ];
  downloadTemplateWorkbook("modelo_importacao_usuarios.xlsx", rows, {
    E: TEMPLATE_OPTIONS.userStatus
  });
}

function downloadAssignmentTemplate() {
  const rows = [
    ["software", "key", "name", "email", "startDate", "returnDate", "status", "notes"],
    ["AutoCAD", "ACD-2026-001", "Ana Silva", "ana.silva@empresa.com", "2026-05-25", "", "Em uso", "Exemplo com chave informada"],
    ["Microsoft 365", "M365-BUS-010", "Carlos Souza", "carlos.souza@empresa.com", "2026-05-25", "", "Em uso", "Relaciona por software, nome e e-mail"]
  ];
  downloadTemplateWorkbook("modelo_importacao_vinculos.xlsx", rows, {
    G: TEMPLATE_OPTIONS.assignmentStatus
  });
}

function downloadFinancialTemplate() {
  const rows = [
    ["software", "fornecedor", "nf", "boleto", "vencimento"],
    ["Senior MEGA", "2026", "119249", "38011.17", "2026-05-25"]
  ];
  downloadTemplateWorkbook("modelo_importacao_financeiro.xlsx", rows);
}

async function importLicenseCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const rows = await readImportRows(file);
    if (rows.length < 2) throw new Error("O arquivo nao possui linhas para importar.");
    const headers = rows[0].map((item) => item.trim());
    const required = ["software", "type", "seats"];
    const missing = required.filter((header) => !headers.includes(header));
    if (missing.length) throw new Error(`Colunas obrigatorias ausentes: ${missing.join(", ")}`);

    const licenses = rows.slice(1)
      .filter((row) => row.some((cell) => String(cell).trim()))
      .map((row) => rowToLicense(headers, row));

    if (!licenses.length) throw new Error("Nenhuma licenca encontrada para importar.");

    const confirmed = await confirmAction(
      "Importar licencas",
      `Importar ${licenses.length} chaves/licencas do arquivo?`,
      "Importar"
    );
    if (!confirmed) return;

    for (const license of licenses) {
      await upsertImportedLicense(license);
    }
    await loadData();
    alert(`${licenses.length} chaves processadas com sucesso.`);
  } catch (error) {
    alert(error.message || "Arquivo invalido.");
  } finally {
    event.target.value = "";
  }
}

async function importUserCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const rows = await readImportRows(file);
    if (rows.length < 2) throw new Error("O arquivo nao possui linhas para importar.");
    const headers = rows[0].map((item) => item.trim());
    const required = ["name", "email"];
    const missing = required.filter((header) => !headers.includes(header));
    if (missing.length) throw new Error(`Colunas obrigatorias ausentes: ${missing.join(", ")}`);

    const users = rows.slice(1)
      .filter((row) => row.some((cell) => String(cell).trim()))
      .map((row) => rowToUser(headers, row));

    if (!users.length) throw new Error("Nenhum usuario encontrado para importar.");

    const confirmed = await confirmAction(
      "Importar usuarios",
      `Importar ${users.length} usuarios do arquivo?`,
      "Importar"
    );
    if (!confirmed) return;

    for (const user of users) {
      await upsertImportedUser(user);
    }
    await loadData();
    alert(`${users.length} usuarios processados com sucesso.`);
  } catch (error) {
    alert(error.message || "Arquivo invalido.");
  } finally {
    event.target.value = "";
  }
}

async function importAssignmentCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const rows = await readImportRows(file);
    if (rows.length < 2) throw new Error("O arquivo nao possui linhas para importar.");
    const headers = rows[0].map((item) => item.trim());
    const required = ["software", "name", "email"];
    const missing = required.filter((header) => !headers.includes(header));
    if (missing.length) throw new Error(`Colunas obrigatorias ausentes: ${missing.join(", ")}`);

    const assignments = rows.slice(1)
      .filter((row) => row.some((cell) => String(cell).trim()))
      .map((row, index) => rowToAssignment(headers, row, index + 2));

    if (!assignments.length) throw new Error("Nenhum vinculo encontrado para importar.");

    const confirmed = await confirmAction(
      "Importar vinculos",
      `Importar ${assignments.length} vinculos do arquivo?`,
      "Importar"
    );
    if (!confirmed) return;

    for (const assignment of assignments) {
      await upsertImportedAssignment(assignment);
    }
    await loadData();
    alert(`${assignments.length} vinculos processados com sucesso.`);
  } catch (error) {
    alert(error.message || "Arquivo invalido.");
  } finally {
    event.target.value = "";
  }
}

async function importFinancialCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const rows = await readImportRows(file);
    if (rows.length < 2) throw new Error("O arquivo nao possui linhas para importar.");
    const headers = rows[0].map((item) => item.trim());
    const required = ["software", "fornecedor", "nf", "boleto", "vencimento"];
    const missing = required.filter((header) => !headers.includes(header));
    if (missing.length) throw new Error(`Colunas obrigatorias ausentes: ${missing.join(", ")}`);

    const items = rows.slice(1)
      .filter((row) => row.some((cell) => String(cell).trim()))
      .map((row) => rowToFinancialItem(headers, row));

    if (!items.length) throw new Error("Nenhum item financeiro encontrado para importar.");

    const confirmed = await confirmAction(
      "Importar financeiro",
      `Importar ${items.length} itens financeiros? Registros existentes serao atualizados e novos serao criados.`,
      "Importar"
    );
    if (!confirmed) return;

    await api("/api/financial-items/import", {
      method: "POST",
      body: JSON.stringify({ items })
    });
    await loadData();
    alert(`${items.length} itens financeiros processados com sucesso.`);
  } catch (error) {
    alert(error.message || "Arquivo invalido.");
  } finally {
    event.target.value = "";
  }
}

async function upsertImportedLicense(license) {
  const existing = findExistingLicenseForImport(license);
  await saveResource(
    existing ? `/api/licenses/${existing.id}` : "/api/licenses",
    existing ? "PUT" : "POST",
    license
  );
}

async function upsertImportedUser(user) {
  const existing = state.users.find((item) => normalizeText(item.email) === normalizeText(user.email));
  await saveResource(
    existing ? `/api/users/${existing.id}` : "/api/users",
    existing ? "PUT" : "POST",
    user
  );
}

async function upsertImportedAssignment(assignment) {
  const existing = state.assignments.find((item) => item.licenseId === assignment.licenseId && item.userId === assignment.userId);
  await saveResource(
    existing ? `/api/assignments/${existing.id}` : "/api/assignments",
    existing ? "PUT" : "POST",
    assignment
  );
}

async function syncMegaFinancial() {
  const confirmed = await confirmAction(
    "Atualizar MEGA",
    "Buscar informacoes atualizadas no Oracle do MEGA e atualizar Status/AP dos boletos financeiros?",
    "Atualizar"
  );
  if (!confirmed) return;

  try {
    const result = await api("/api/financial-items/sync-mega", {
      method: "POST",
      body: "{}"
    });
    await loadData();
    alert(`Atualizacao concluida. Registros MEGA: ${result.megaRows}. Correspondencias: ${result.matched}. Itens atualizados: ${result.updated}.`);
  } catch (error) {
    alert(error.message);
  }
}

async function sendFinancialAlerts() {
  if (currentView === "settings") {
    await saveResource("/api/settings/email", "PUT", readEmailSettingsForm());
    await loadEmailSettings();
  }

  const confirmed = await confirmAction(
    "Enviar alertas",
    "Enviar e-mail com boletos vencidos ou a vencer em ate 10 dias e com status Aguardando Pagamento?",
    "Enviar"
  );
  if (!confirmed) return;

  try {
    const result = await api("/api/financial-items/send-alerts", {
      method: "POST",
      body: "{}"
    });
    if (!result.sent) {
      alert(result.reason || "Nenhum boleto pendente para alertar.");
      return;
    }
    alert(`E-mail enviado para ${result.to}. Boletos informados: ${result.count}.`);
  } catch (error) {
    alert(error.message);
  }
}

async function lookupMegaFinancial() {
  const nf = value("#financialNf");
  const codFornecedor = value("#financialCodFornecedor");
  if (!nf) {
    alert("Informe a NF para buscar no MEGA.");
    return;
  }
  if (!codFornecedor) {
    alert("Informe o codigo do fornecedor para cruzar com o MEGA.");
    return;
  }

  const button = document.querySelector("#lookupMegaFinancial");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Buscando...";

  try {
    const result = await api("/api/financial-items/lookup-mega", {
      method: "POST",
      body: JSON.stringify(buildFinancialItemFromForm())
    });

    if (!result.matched) {
      alert("Nenhuma AP encontrada no MEGA para esta NF e codigo do fornecedor.");
      return;
    }

    const item = result.item || {};
    setValue("#financialAp", item.ap || "");
    setValue("#financialStatus", item.status || "Aguardando Pagamento");
    setValue("#financialCodFornecedor", item.codFornecedor || codFornecedor);
    setValue("#financialNomeFornecedor", item.nomeFornecedor || "");
    setValue("#financialFilial", item.filial || "");
    alert("Informacoes do MEGA carregadas no cadastro.");
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  downloadBlob(blob, `controle-licencas-${today()}.json`);
}

function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      await api("/api/import", {
        method: "POST",
        body: JSON.stringify(data)
      });
      await loadData();
    } catch (error) {
      alert(error.message || "Arquivo invalido.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function copyReport() {
  const text = buildReportText();
  navigator.clipboard.writeText(text);
}

function downloadCsv() {
  const report = buildCurrentReport();
  const header = report.columns.map(reportColumnLabel);
  const rows = report.rows.map((row) => report.columns.map((column) => reportCell(row, column)));
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${report.type}-${today()}.csv`);
}

function buildReportText() {
  const report = buildCurrentReport();
  const header = report.columns.map(reportColumnLabel).join(" | ");
  const rows = report.rows.map((row) => report.columns.map((column) => reportCell(row, column)).join(" | "));
  return [report.title, `Registros: ${report.rows.length}`, header, ...rows].join("\n");
}

function reportColumnLabel(column) {
  return {
    software: "Software",
    fabricante: "Fabricante",
    chave: "Chave",
    tipo: "Tipo",
    quantidade: "Quantidade",
    vencimento: "Vencimento",
    fornecedor: "Fornecedor",
    valor: "Valor",
    status: "Status",
    usuario: "Usuario",
    email: "E-mail",
    departamento: "Departamento",
    inicio: "Inicio",
    devolucao: "Devolucao",
    filial: "Filial",
    nf: "NF",
    ap: "AP",
    alerta: "Alerta"
  }[column] || column;
}

function reportCell(row, column) {
  const value = row[column];
  if (column === "valor") return value ? money(value) : "";
  if (["vencimento", "inicio", "devolucao"].includes(column)) return dateLabel(value);
  return value ?? "";
}

function filtered(list, fields) {
  if (!searchTerm) return list;
  return list.filter((item) => fields(item).join(" ").toLowerCase().includes(searchTerm));
}

function sortTableItems(table, items) {
  const sort = tableSorts[table];
  const list = items.slice();
  if (table === "financial" && !sort) return list.sort(compareFinancialItems);
  if (!sort) return list;

  return list.sort((a, b) => compareSortValues(
    sortValue(table, a, sort.key),
    sortValue(table, b, sort.key),
    sort.direction
  ));
}

function compareSortValues(a, b, direction = "asc") {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  let result;
  if (typeof a === "number" || typeof b === "number") {
    result = Number(a || 0) - Number(b || 0);
  } else {
    result = String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
  }
  return direction === "desc" ? -result : result;
}

function sortValue(table, item, key) {
  if (table === "licenses") return licenseSortValue(item, key);
  if (table === "users") return userSortValue(item, key);
  if (table === "assignments") return assignmentSortValue(item, key);
  if (table === "financial") return financialSortValue(item, key);
  if (table === "access") return accessSortValue(item, key);
  return "";
}

function licenseSortValue(license, key) {
  if (key === "software") return `${license.software || ""} ${license.key || ""}`;
  if (key === "type") return license.type || "";
  if (key === "used") return isSimultaneousLicense(license) ? license.seats : activeAssignments(license.id).length;
  if (key === "expiresAt") return license.expiresAt || "";
  if (key === "status") return licenseStatus(license).label;
  return "";
}

function userSortValue(user, key) {
  if (key === "name") return user.name || "";
  if (key === "email") return user.email || "";
  if (key === "department") return user.department || "";
  if (key === "licenses") {
    return state.assignments.filter((item) => {
      const license = getLicense(item.licenseId);
      return license && !isSimultaneousLicense(license) && item.userId === user.id && isActiveAssignment(item);
    }).length;
  }
  return "";
}

function assignmentSortValue(assignment, key) {
  const license = getLicense(assignment.licenseId) || {};
  const user = getUser(assignment.userId) || {};
  if (key === "user") return user.name || "";
  if (key === "software") return license.software || "";
  if (key === "key") return license.key || "";
  if (key === "startDate") return assignment.startDate || "";
  if (key === "status") return assignment.status || "";
  return "";
}

function financialSortValue(item, key) {
  if (key === "software") return item.fornecedor || "";
  if (key === "supplier") return financialSupplierLabel(item);
  if (key === "nf") return item.nf || "";
  if (key === "amount") return Number(item.boleto) || 0;
  if (key === "dueDate") return item.dataVencimento || "";
  if (key === "status") return item.status || "";
  if (key === "ap") return item.ap || "";
  if (key === "filial") return item.filial || "";
  if (key === "license") return financialLicenseLabel(item.licenseId);
  if (key === "alert") return item.motivoAlerta || "";
  return "";
}

function accessSortValue(user, key) {
  if (key === "username") return user.username || "";
  if (key === "displayName") return user.displayName || "";
  if (key === "email") return user.email || "";
  if (key === "role") return roleLabel(user.role);
  if (key === "active") return user.active ? "Ativo" : "Inativo";
  return "";
}

function sortLicenseGroups(groups) {
  const sort = tableSorts.licenses;
  return groups.sort((a, b) => compareSortValues(
    licenseGroupSortValue(a, sort.key),
    licenseGroupSortValue(b, sort.key),
    sort.direction
  ));
}

function licenseGroupSortValue(group, key) {
  if (key === "software") return group.name;
  if (key === "type") return uniqueValues(group.licenses.map((license) => license.type)).join(", ");
  if (key === "used") return group.licenses.reduce((total, license) => total + (isSimultaneousLicense(license) ? license.seats : activeAssignments(license.id).length), 0);
  if (key === "expiresAt") return group.licenses.map((license) => license.expiresAt).filter(Boolean).sort()[0] || "";
  if (key === "status") return group.licenses.some((license) => licenseStatus(license).code === "bad")
    ? "Vencida"
    : group.licenses.some((license) => licenseStatus(license).code === "warn") ? "A vencer" : "Ativa";
  return group.name;
}

function sortAssignmentGroups(groups) {
  const sort = tableSorts.assignments;
  return groups.sort((a, b) => compareSortValues(
    assignmentGroupSortValue(a, sort.key),
    assignmentGroupSortValue(b, sort.key),
    sort.direction
  ));
}

function assignmentGroupSortValue(group, key) {
  if (key === "software") return group.name;
  if (key === "user") return uniqueValues(group.assignments.map((assignment) => getUser(assignment.userId)?.name || "")).sort()[0] || "";
  if (key === "key") return uniqueValues(group.assignments.map((assignment) => getLicense(assignment.licenseId)?.key || "")).sort()[0] || "";
  if (key === "startDate") return nextAssignmentStartDate(group.assignments);
  if (key === "status") return group.assignments.filter(isActiveAssignment).length ? "Ativo" : "Sem uso ativo";
  return group.name;
}

function updateSortIndicators() {
  document.querySelectorAll(".sort-header").forEach((button) => {
    const sort = tableSorts[button.dataset.sortTable];
    const isActive = sort?.key === button.dataset.sortKey;
    button.classList.toggle("active", Boolean(isActive));
    const arrow = button.querySelector(".sort-arrow");
    if (arrow) arrow.textContent = isActive ? (sort.direction === "asc" ? "↑" : "↓") : "";
    button.setAttribute("aria-sort", isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none");
  });
}

function applyPermissions() {
  document.body.classList.toggle("readonly", Boolean(currentUser) && !canManageData());
  document.body.classList.toggle("not-admin", Boolean(currentUser) && !isAdmin());
}

function isAdmin() {
  return currentUser?.role === "admin";
}

function canManageData() {
  return ["admin", "member"].includes(currentUser?.role);
}

function canModifyRecord(type, idValue) {
  if (isAdmin()) return true;
  if (!canManageData()) return false;
  const collections = {
    license: state.licenses,
    user: state.users,
    assignment: state.assignments,
    financial: state.financialItems
  };
  const item = collections[type]?.find((entry) => entry.id === idValue);
  return Boolean(item?.createdBy && item.createdBy === currentUser?.id);
}

function roleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "member") return "Membro";
  return "Somente visualizacao";
}

function softwareGroups() {
  const groups = new Map();
  state.licenses.forEach((license) => {
    const name = license.software || "Sem software";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(license);
  });
  return Array.from(groups.entries())
    .map(([name, licenses]) => ({
      name,
      licenses: licenses.slice().sort((a, b) => a.key.localeCompare(b.key))
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function groupLicensesForTable(licenses) {
  const groups = new Map();
  licenses.forEach((license) => {
    const name = license.software || "Sem software";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(license);
  });
  return sortLicenseGroups(Array.from(groups.entries())
    .map(([name, groupLicenses]) => ({
      name,
      licenses: sortTableItems("licenses", groupLicenses)
    })));
}

function groupAssignmentsForTable(assignments) {
  const groups = new Map();
  assignments.forEach((assignment) => {
    const license = getLicense(assignment.licenseId) || {};
    const name = license.software || "Chave removida";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(assignment);
  });

  return sortAssignmentGroups(Array.from(groups.entries())
    .map(([name, groupAssignments]) => ({
      name,
      assignments: sortTableItems("assignments", groupAssignments)
    })));
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function activeAssignments(licenseId, exceptId = "") {
  return state.assignments.filter((item) => item.licenseId === licenseId && item.id !== exceptId && isActiveAssignment(item));
}

function isSimultaneousLicense(license) {
  return normalizeText(license?.type) === "usuarios simultaneos";
}

function licenseUsageCount(license) {
  if (isSimultaneousLicense(license)) return 0;
  return activeAssignments(license.id).length;
}

function licenseUsageLabel(license) {
  if (isSimultaneousLicense(license)) {
    return `${license.seats} usuarios simultaneos`;
  }
  return `${activeAssignments(license.id).length}/${license.seats}`;
}

function licenseGroupUsageLabel(licenses) {
  const namedLicenses = licenses.filter((license) => !isSimultaneousLicense(license));
  const simultaneousSeats = licenses
    .filter(isSimultaneousLicense)
    .reduce((total, license) => total + license.seats, 0);
  const namedSeats = namedLicenses.reduce((total, license) => total + license.seats, 0);
  const namedUsed = namedLicenses.reduce((total, license) => total + activeAssignments(license.id).length, 0);
  return [
    namedSeats ? `${namedUsed}/${namedSeats}` : "",
    simultaneousSeats ? `${simultaneousSeats} simultaneos` : ""
  ].filter(Boolean).join(" - ");
}

function isActiveAssignment(item) {
  return item.status === "Em uso" || item.status === "Reservada";
}

function assignmentStatusCode(assignment) {
  return assignment.status === "Em uso" ? "ok" : assignment.status === "Reservada" ? "info" : "warn";
}

function licenseStatus(license) {
  if (!license.expiresAt) return { label: "Sem vencimento", code: "info" };
  const days = daysUntil(license.expiresAt);
  if (days < 0) return { label: "Vencida", code: "bad" };
  if (days <= 30) return { label: "A vencer", code: "warn" };
  return { label: "Ativa", code: "ok" };
}

function statusBadge(label, code) {
  return `<span class="status ${code}">${escapeHtml(label)}</span>`;
}

function getLicense(idValue) {
  return state.licenses.find((item) => item.id === idValue);
}

function getUser(idValue) {
  return state.users.find((item) => item.id === idValue);
}

function value(selector) {
  return document.querySelector(selector).value.trim();
}

function setValue(selector, nextValue) {
  document.querySelector(selector).value = nextValue ?? "";
}

function setText(selector, nextValue) {
  document.querySelector(selector).textContent = nextValue;
}

function setFormValues(values) {
  Object.entries(values).forEach(([selector, nextValue]) => setValue(selector, nextValue));
}

function openEditDialog(form, title) {
  if (!formHomes.has(form.id)) {
    formHomes.set(form.id, {
      parent: form.parentElement,
      nextSibling: form.nextElementSibling
    });
  }
  els.editDialogTitle.textContent = title;
  els.editDialogBody.appendChild(form);
  if (!els.editDialog.open) els.editDialog.showModal();
}

function closeEditDialog() {
  if (els.editDialog.open) els.editDialog.close();
}

function restoreEditingForm() {
  const form = els.editDialogBody.querySelector("form");
  if (!form) return;
  const home = formHomes.get(form.id);
  if (!home) return;
  if (home.nextSibling && home.nextSibling.parentElement === home.parent) {
    home.parent.insertBefore(form, home.nextSibling);
  } else {
    home.parent.appendChild(form);
  }
}

function showLoadError(message) {
  document.querySelector("#renewalList").innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
}

function dateLabel(value) {
  if (!value) return "Sem data";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(value) {
  const todayDate = new Date(today());
  const target = new Date(value);
  return Math.ceil((target - todayDate) / 86400000);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

async function readImportRows(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || file.type.includes("spreadsheetml")) {
    return parseXlsxRows(await file.arrayBuffer());
  }
  return parseCsv(await file.text());
}

function downloadTemplateWorkbook(filename, rows, listValidations = {}) {
  const workbook = buildTemplateWorkbook(rows, listValidations);
  downloadBlob(workbook, filename);
}

function buildTemplateWorkbook(rows, listValidations) {
  const sheetXml = buildWorksheetXml(rows, listValidations);
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Importacao" sheetId="1" r:id="rId1"/></sheets>
</workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/></cellXfs>
</styleSheet>`],
    ["xl/worksheets/sheet1.xml", sheetXml]
  ];

  return new Blob([zipStore(files)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

function buildWorksheetXml(rows, listValidations) {
  const maxColumns = Math.max(...rows.map((row) => row.length));
  const sheetData = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnLetter(columnIndex + 1)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? ` s="1"` : "";
      return `<c r="${ref}" t="inlineStr"${style}><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const widths = Array.from({ length: maxColumns }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="22" customWidth="1"/>`).join("");
  const validations = Object.entries(listValidations).map(([column, options]) => {
    const formula = options.join(",");
    return `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${column}2:${column}2000"><formula1>"${xmlEscape(formula)}"</formula1></dataValidation>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${widths}</cols>
<sheetData>${sheetData}</sheetData>
${validations ? `<dataValidations count="${Object.keys(listValidations).length}">${validations}</dataValidations>` : ""}
</worksheet>`;
}

function columnLetter(number) {
  let result = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }
  return result;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach(([name, text]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const local = zipHeader(30);
    writeZipHeader(local, {
      signature: 0x04034b50,
      crc,
      size: data.length,
      nameLength: nameBytes.length
    });
    localParts.push(local, nameBytes, data);

    const central = zipHeader(46);
    writeZipHeader(central, {
      signature: 0x02014b50,
      madeBy: 20,
      crc,
      size: data.length,
      nameLength: nameBytes.length,
      offset
    });
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  });

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = zipHeader(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, end]);
}

function zipHeader(size) {
  return new Uint8Array(size);
}

function writeZipHeader(header, options) {
  const view = new DataView(header.buffer);
  view.setUint32(0, options.signature, true);
  if (options.signature === 0x02014b50) view.setUint16(4, options.madeBy || 20, true);
  const versionOffset = options.signature === 0x02014b50 ? 6 : 4;
  view.setUint16(versionOffset, 20, true);
  const methodOffset = options.signature === 0x02014b50 ? 10 : 8;
  view.setUint16(methodOffset, 0, true);
  const crcOffset = options.signature === 0x02014b50 ? 16 : 14;
  view.setUint32(crcOffset, options.crc, true);
  view.setUint32(crcOffset + 4, options.size, true);
  view.setUint32(crcOffset + 8, options.size, true);
  view.setUint16(crcOffset + 12, options.nameLength, true);
  if (options.signature === 0x02014b50) view.setUint32(42, options.offset, true);
}

function crc32(bytes) {
  let crc = -1;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[index]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

async function parseXlsxRows(buffer) {
  const entries = await unzipXlsx(buffer);
  const sheetXml = entries.get("xl/worksheets/sheet1.xml");
  if (!sheetXml) throw new Error("Planilha XLSX sem aba de importacao.");
  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml") || "");
  const sheet = new DOMParser().parseFromString(sheetXml, "application/xml");
  const rows = [];
  sheet.querySelectorAll("sheetData row").forEach((rowNode) => {
    const rowIndex = Number(rowNode.getAttribute("r")) || rows.length + 1;
    const row = [];
    rowNode.querySelectorAll("c").forEach((cellNode) => {
      const ref = cellNode.getAttribute("r") || "";
      const column = columnIndexFromRef(ref);
      if (!column) return;
      row[column - 1] = xlsxCellText(cellNode, sharedStrings);
    });
    rows[rowIndex - 1] = row.map((cell) => cell || "");
  });
  return rows.filter((row) => row?.some((cell) => String(cell).trim()));
}

async function unzipXlsx(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const entries = new Map();
  const endOffset = findZipEnd(bytes);
  if (endOffset < 0) throw new Error("Arquivo XLSX invalido.");
  const centralCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);

  for (let index = 0; index < centralCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength)).replaceAll("\\", "/");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.slice(dataStart, dataStart + compressedSize);
    const content = method === 0
      ? data
      : method === 8
        ? await inflateRaw(data, uncompressedSize)
        : null;
    if (content) entries.set(name, decoder.decode(content));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findZipEnd(bytes) {
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) {
      return index;
    }
  }
  return -1;
}

async function inflateRaw(data, expectedSize) {
  if (!("DecompressionStream" in window)) {
    throw new Error("Este navegador nao consegue ler XLSX compactado. Salve como CSV ou atualize o navegador.");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (expectedSize && bytes.length !== expectedSize) return bytes;
  return bytes;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(doc.querySelectorAll("si")).map((item) =>
    Array.from(item.querySelectorAll("t")).map((textNode) => textNode.textContent || "").join("")
  );
}

function xlsxCellText(cellNode, sharedStrings) {
  const type = cellNode.getAttribute("t");
  if (type === "inlineStr") return cellNode.querySelector("is t")?.textContent || "";
  const value = cellNode.querySelector("v")?.textContent || "";
  if (type === "s") return sharedStrings[Number(value)] || "";
  return value;
}

function columnIndexFromRef(ref) {
  const letters = (ref.match(/[A-Z]+/i) || [""])[0].toUpperCase();
  return letters.split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;
  const delimiter = detectDelimiter(text);

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && insideQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((item) => item.some((cellValue) => String(cellValue).trim()));
}

function detectDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/)[0] || "";
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return semicolonCount >= commaCount ? ";" : ",";
}

function rowToLicense(headers, row) {
  const item = {};
  headers.forEach((header, index) => {
    item[header] = String(row[index] ?? "").trim();
  });

  return {
    software: item.software,
    vendor: item.vendor || "",
    type: item.type,
    key: item.key,
    seats: Math.max(1, Number(item.seats) || 1),
    expiresAt: item.expiresAt || "",
    supplier: item.supplier || "",
    notes: item.notes || ""
  };
}

function rowToUser(headers, row) {
  const item = {};
  headers.forEach((header, index) => {
    item[header] = String(row[index] ?? "").trim();
  });

  return {
    name: item.name,
    email: item.email,
    department: item.department || "",
    device: item.device || "",
    status: item.status || "Ativo"
  };
}

function rowToAssignment(headers, row, rowNumber) {
  const item = {};
  headers.forEach((header, index) => {
    item[header] = String(row[index] ?? "").trim();
  });

  const user = findUserForImport(item.name, item.email);
  if (!user) {
    throw new Error(`Linha ${rowNumber}: usuario nao encontrado para ${item.name} / ${item.email}.`);
  }

  const license = findLicenseForImport(item.software, item.key, rowNumber);
  if (isSimultaneousLicense(license)) {
    throw new Error(`Linha ${rowNumber}: licencas de Usuarios simultaneos nao precisam de vinculo por usuario.`);
  }

  return {
    licenseId: license.id,
    userId: user.id,
    startDate: item.startDate || today(),
    returnDate: item.returnDate || "",
    status: item.status || "Em uso",
    notes: item.notes || ""
  };
}

function rowToFinancialItem(headers, row) {
  const item = {};
  headers.forEach((header, index) => {
    item[header] = String(row[index] ?? "").trim();
  });

  return {
    licenseId: item.licenseId || "",
    setor: item.setor || "",
    categoria: item.categoria || "",
    fornecedor: item.software || "",
    filial: item.filial || "",
    nf: item.nf || "",
    boleto: Number(String(item.boleto || "0").replace(",", ".")) || 0,
    dataEmissao: normalizeDateInput(item.dataEmissao),
    dataVencimento: normalizeDateInput(item.vencimento || item.dataVencimento),
    status: item.status || "Aguardando Pagamento",
    observacoes: item.observacoes || "",
    codFornecedor: item.codFornecedor || item.fornecedor || "",
    nomeFornecedor: item.nomeFornecedor || "",
    ap: item.ap || "",
    alerta: item.alerta || "",
    apLocalizada: item.apLocalizada || "",
    motivoAlerta: item.motivoAlerta || "",
    enviarAlerta: item.enviarAlerta || ""
  };
}

function findUserForImport(name, email) {
  const normalizedEmail = normalizeText(email);
  const normalizedName = normalizeText(name);
  return state.users.find((user) => normalizeText(user.email) === normalizedEmail)
    || state.users.find((user) => normalizeText(user.name) === normalizedName);
}

function findLicenseForImport(software, key, rowNumber) {
  const normalizedSoftware = normalizeText(software);
  const normalizedKey = normalizeText(key);
  const matches = state.licenses.filter((license) => normalizeText(license.software) === normalizedSoftware);

  if (!matches.length) {
    throw new Error(`Linha ${rowNumber}: software nao encontrado: ${software}.`);
  }

  if (normalizedKey) {
    const license = matches.find((item) => normalizeText(item.key) === normalizedKey);
    if (!license) {
      throw new Error(`Linha ${rowNumber}: chave nao encontrada para ${software}: ${key}.`);
    }
    return license;
  }

  if (matches.length > 1) {
    throw new Error(`Linha ${rowNumber}: ${software} possui varias chaves. Informe a coluna key.`);
  }

  return matches[0];
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function findExistingLicenseForImport(license) {
  const normalizedSoftware = normalizeText(license.software);
  const normalizedKey = normalizeText(license.key);
  const sameSoftware = state.licenses.filter((item) => normalizeText(item.software) === normalizedSoftware);

  if (normalizedKey) {
    return sameSoftware.find((item) => normalizeText(item.key) === normalizedKey) || null;
  }

  const emptyKey = sameSoftware.find((item) => !normalizeText(item.key) && normalizeText(item.type) === normalizeText(license.type));
  if (emptyKey) return emptyKey;

  return sameSoftware.length === 1 ? sameSoftware[0] : null;
}

function uniqueFinancialFilterOptions(type) {
  const field = {
    software: "fornecedor",
    filial: "filial",
    status: "status"
  }[type];
  if (!field) return [];

  return Array.from(new Set(
    state.financialItems
      .map((item) => item[field] || (type === "status" ? "Sem status" : ""))
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
}

function normalizeDateInput(value) {
  const textValue = String(value || "").trim();
  if (!textValue) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(textValue)) return textValue;
  if (/^\d+(\.\d+)?$/.test(textValue) && Number(textValue) > 20000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(textValue)) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const isoDateTime = textValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateTime) return `${isoDateTime[1]}-${isoDateTime[2]}-${isoDateTime[3]}`;
  const br = textValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const [, day, month, year] = br;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const us = textValue.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (us) {
    const [, month, day, year] = us;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return "";
}

function financialStatusCode(item) {
  const status = normalizeText(item.status);
  if (isPaidStatus(status)) return "ok";
  if (status === "aguardando pagamento") return "warn";
  if (status === "em aberto") return "info";
  if (status === "cancelado") return "bad";
  return "info";
}

function isPaidStatus(status) {
  const normalized = normalizeText(status);
  return normalized === "pago" || normalized === "pagos";
}

function compareFinancialItems(a, b) {
  const aDuePriority = financialDuePriority(a);
  const bDuePriority = financialDuePriority(b);
  if (aDuePriority !== bDuePriority) return aDuePriority - bDuePriority;

  const statusOrder = {
    "em aberto": 0,
    "aguardando pagamento": 1,
    "pago": 2,
    "pagos": 2
  };
  const aStatus = statusOrder[normalizeText(a.status)] ?? 3;
  const bStatus = statusOrder[normalizeText(b.status)] ?? 3;
  if (aStatus !== bStatus) return aStatus - bStatus;
  return String(a.fornecedor || "").localeCompare(String(b.fornecedor || ""))
    || String(a.dataVencimento || "").localeCompare(String(b.dataVencimento || ""))
    || String(a.nf || "").localeCompare(String(b.nf || ""));
}

function financialDuePriority(item) {
  if (!item.dataVencimento || isPaidStatus(item.status)) return 2;
  const days = daysUntil(item.dataVencimento);
  if (days < 0) return 0;
  if (days <= 10) return 1;
  return 2;
}

function financialSupplierLabel(item) {
  const code = item.codFornecedor || "";
  const name = item.nomeFornecedor || "";
  if (code && name) return `${code} - ${name}`;
  return code || name || item.categoria || item.setor;
}

function financialAlertLabel(dateValue, status) {
  if (normalizeText(status) === "pago") return "OK";
  if (!dateValue) return "";
  const days = daysUntil(dateValue);
  if (days < 0) return `Vencido ha ${Math.abs(days)} dias`;
  if (days === 0) return "Vence hoje";
  return `Vence em ${days} dias`;
}

function financialReasonLabel(dateValue, status, apLocalizada) {
  if (normalizeText(status) === "pago") return financialAlertLabel(dateValue, status);
  const alert = financialAlertLabel(dateValue, status);
  if (!alert) return "";
  const apText = normalizeText(apLocalizada) === "sim"
    ? "AP criada, aguardando pagamento"
    : "sem AP criada/localizada";
  return `${alert} - ${apText}`;
}

function shouldSendFinancialAlert(dateValue, status) {
  if (normalizeText(status) === "pago" || !dateValue) return false;
  return daysUntil(dateValue) <= 10;
}

function financialLicenseLabel(licenseId) {
  const license = getLicense(licenseId);
  return license ? `${license.software} - ${license.key}` : "";
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.editItem = editItem;
window.deleteItem = deleteItem;
window.newKeyForSoftware = newKeyForSoftware;
window.toggleLicenseGroup = toggleLicenseGroup;
window.toggleAssignmentGroup = toggleAssignmentGroup;
