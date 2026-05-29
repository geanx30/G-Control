let nodemailer;
const fs = require("fs");
const path = require("path");

try {
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}

function isEmailConfigured(settings = envSettings()) {
  if (emailProvider(settings) === "graph") {
    return Boolean(
      settings.graphTenantId &&
      settings.graphClientId &&
      settings.graphClientSecret &&
      settings.alertEmailFrom &&
      settings.alertEmailTo
    );
  }

  return Boolean(
    nodemailer &&
    settings.smtpHost &&
    settings.smtpPort &&
    settings.smtpUser &&
    settings.smtpPassword &&
    settings.alertEmailTo
  );
}

async function sendFinancialAlertEmail(items, settings = envSettings()) {
  if (!isEmailConfigured(settings)) {
    throw new Error("Configure os dados de disparo de e-mail em Configuracoes.");
  }
  if (!items.length) {
    return { sent: false, reason: "Nenhum boleto pendente para alertar." };
  }

  if (emailProvider(settings) === "graph") {
    return sendGraphFinancialAlertEmail(items, settings);
  }

  if (!nodemailer) {
    throw new Error("Dependencia de e-mail ausente. Execute npm install e reinicie o sistema.");
  }

  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: Number(settings.smtpPort),
    secure: String(settings.smtpSecure || "").toLowerCase() === "true",
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPassword
    }
  });

  const from = settings.alertEmailFrom || settings.smtpUser;
  const to = settings.alertEmailTo;
  const subject = `G-Control - ${items.length} boleto(s) pendente(s)`;

  await transporter.sendMail({
    from,
    to,
    subject,
    text: buildFinancialAlertText(items),
    html: buildFinancialAlertHtml(items, { logoSrc: "cid:gcontrol-logo" }),
    attachments: emailLogoAttachment()
  });

  return { sent: true, to, count: items.length };
}

async function sendGraphFinancialAlertEmail(items, settings) {
  const from = normalizeMailbox(settings.alertEmailFrom);
  const to = parseRecipients(settings.alertEmailTo);
  if (!from) throw new Error("Informe o e-mail remetente para envio pelo Microsoft Graph.");
  if (!to.length) throw new Error("Informe ao menos um destinatario.");

  const token = await getGraphAccessToken(settings);
  const subject = `G-Control - ${items.length} boleto(s) pendente(s)`;
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: buildFinancialAlertHtml(items)
        },
        toRecipients: to.map((address) => ({
          emailAddress: { address }
        }))
      },
      saveToSentItems: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Falha no envio pelo Microsoft Graph (${response.status}): ${errorText || response.statusText}`);
  }

  return { sent: true, to: to.join(","), count: items.length, provider: "graph" };
}

async function getGraphAccessToken(settings) {
  const tenant = encodeURIComponent(settings.graphTenantId);
  const body = new URLSearchParams({
    client_id: settings.graphClientId,
    client_secret: settings.graphClientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials"
  });
  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Falha ao autenticar no Microsoft Graph: ${payload.error_description || payload.error || response.statusText}`);
  }
  return payload.access_token;
}

function parseRecipients(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((item) => normalizeMailbox(item))
    .filter(Boolean);
}

function normalizeMailbox(value) {
  const text = String(value || "").trim();
  const match = text.match(/<([^>]+)>/);
  return (match ? match[1] : text).trim();
}

function emailProvider(settings = {}) {
  return String(settings.emailProvider || "smtp").toLowerCase() === "graph" ? "graph" : "smtp";
}

function buildFinancialAlertText(items) {
  return [
    "Boletos vencidos ou a vencer em ate 10 dias",
    "",
    ...items.map((item) => [
      `Software: ${item.software}`,
      `NF: ${item.nf || "-"}`,
      `AP: ${item.ap || "-"}`,
      `Vencimento: ${item.vencimento || "-"}`,
      `Status do pagamento: ${item.status}`,
      `Prazo: ${item.prazo}`
    ].join("\n")),
    "",
    "Mensagem automatica do G-Control."
  ].join("\n\n");
}

function buildFinancialAlertHtml(items, options = {}) {
  const overdue = items.filter((item) => String(item.prazo || "").toLowerCase().includes("vencido")).length;
  const dueSoon = items.length - overdue;
  const logo = options.logoSrc || getEmailLogoDataUri();
  const rows = items.map((item, index) => {
    const isOverdue = String(item.prazo || "").toLowerCase().includes("vencido");
    return `
    <tr style="background:${index % 2 ? "#ffffff" : "#f9fafb"};">
      <td style="${tdStyle()}"><strong style="color:#111827;">${escapeHtml(item.software)}</strong></td>
      <td style="${tdStyle()}">${escapeHtml(item.nf || "-")}</td>
      <td style="${tdStyle()}">${escapeHtml(item.ap || "-")}</td>
      <td style="${tdStyle()}">${escapeHtml(formatDateBr(item.vencimento) || "-")}</td>
      <td style="${tdStyle()}">${statusPill(item.status)}</td>
      <td style="${tdStyle()}">${deadlinePill(item.prazo, isOverdue)}</td>
    </tr>
  `;
  }).join("");

  return `
    <div style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
      <div style="max-width:920px;margin:0 auto;padding:28px 18px;">
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <div style="background:#9f1239;padding:24px 28px;color:#ffffff;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="vertical-align:middle;">
                  <div style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;opacity:.9;">G-Control</div>
                  <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;font-weight:700;">Boletos vencidos ou a vencer</h1>
                  <p style="margin:8px 0 0;color:#ffe4e6;font-size:14px;">Itens com vencimento em ate 10 dias e status aguardando pagamento.</p>
                </td>
                <td align="right" style="vertical-align:middle;width:150px;">
                  ${logo ? `<img src="${logo}" alt="G-Control" width="132" style="display:block;margin-left:auto;border-radius:6px;background:#ffffff;padding:6px;">` : ""}
                </td>
              </tr>
            </table>
          </div>

          <div style="padding:22px 28px 10px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
              <tr>
                <td style="padding:0 10px 10px 0;">
                  <div style="${summaryCardStyle()}">
                    <div style="${summaryLabelStyle()}">Total de boletos</div>
                    <div style="${summaryNumberStyle()}">${items.length}</div>
                  </div>
                </td>
                <td style="padding:0 10px 10px 0;">
                  <div style="${summaryCardStyle()}">
                    <div style="${summaryLabelStyle()}">Vencidos</div>
                    <div style="${summaryNumberStyle("#be123c")}">${overdue}</div>
                  </div>
                </td>
                <td style="padding:0 0 10px 0;">
                  <div style="${summaryCardStyle()}">
                    <div style="${summaryLabelStyle()}">A vencer</div>
                    <div style="${summaryNumberStyle("#b45309")}">${dueSoon}</div>
                  </div>
                </td>
              </tr>
            </table>

            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th align="left" style="${thStyle()}">Software</th>
                  <th align="left" style="${thStyle()}">NF</th>
                  <th align="left" style="${thStyle()}">AP</th>
                  <th align="left" style="${thStyle()}">Vencimento</th>
                  <th align="left" style="${thStyle()}">Status</th>
                  <th align="left" style="${thStyle()}">Prazo</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>

            <p style="margin:18px 0 4px;color:#6b7280;font-size:13px;line-height:1.5;">
              Mensagem automatica enviada pelo G-Control. Verifique os boletos no modulo Financeiro para atualizar AP, status ou vencimento.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function thStyle() {
  return "padding:12px 14px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:12px;text-transform:uppercase;letter-spacing:.04em;";
}

function tdStyle() {
  return "padding:13px 14px;border-bottom:1px solid #eef2f7;color:#374151;font-size:14px;vertical-align:middle;";
}

function summaryCardStyle() {
  return "border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;background:#ffffff;";
}

function summaryLabelStyle() {
  return "font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;";
}

function summaryNumberStyle(color = "#111827") {
  return `font-size:24px;line-height:1.2;font-weight:700;color:${color};margin-top:4px;`;
}

function statusPill(status) {
  return `<span style="display:inline-block;padding:5px 9px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:700;">${escapeHtml(status || "Sem status")}</span>`;
}

function deadlinePill(value, isOverdue) {
  const background = isOverdue ? "#ffe4e6" : "#ecfdf5";
  const color = isOverdue ? "#be123c" : "#047857";
  return `<span style="display:inline-block;padding:5px 9px;border-radius:999px;background:${background};color:${color};font-size:12px;font-weight:700;">${escapeHtml(value || "-")}</span>`;
}

function formatDateBr(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function getEmailLogoDataUri() {
  try {
    const logoPath = path.join(__dirname, "assets", "g-control-email-logo.png");
    const logo = fs.readFileSync(logoPath);
    return `data:image/png;base64,${logo.toString("base64")}`;
  } catch {
    return "";
  }
}

function emailLogoAttachment() {
  const logoPath = path.join(__dirname, "assets", "g-control-email-logo.png");
  if (!fs.existsSync(logoPath)) return [];
  return [{
    filename: "g-control-logo.png",
    path: logoPath,
    cid: "gcontrol-logo"
  }];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

module.exports = {
  isEmailConfigured,
  sendFinancialAlertEmail
};

function envSettings() {
  return {
    smtpHost: process.env.SMTP_HOST || "",
    smtpPort: process.env.SMTP_PORT || "",
    smtpSecure: process.env.SMTP_SECURE || "false",
    smtpUser: process.env.SMTP_USER || "",
    smtpPassword: process.env.SMTP_PASSWORD || "",
    alertEmailFrom: process.env.ALERT_EMAIL_FROM || "",
    alertEmailTo: process.env.ALERT_EMAIL_TO || "",
    emailProvider: process.env.EMAIL_PROVIDER || "smtp",
    graphTenantId: process.env.GRAPH_TENANT_ID || "",
    graphClientId: process.env.GRAPH_CLIENT_ID || "",
    graphClientSecret: process.env.GRAPH_CLIENT_SECRET || ""
  };
}
