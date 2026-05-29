require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const { query, transaction } = require("./db");
const {
  createToken,
  decryptSecret,
  encryptSecret,
  hashPassword,
  hasEncryptionKey,
  isEncryptedSecret,
  verifyPassword
} = require("./auth");
const { fetchMegaApRows } = require("./mega-oracle");
const { isEmailConfigured, sendFinancialAlertEmail } = require("./email-alerts");

const app = express();
const port = Number(process.env.PORT) || 3000;
const sessions = new Map();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

app.get("/api/health", async (req, res, next) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const username = text(req.body.username).toLowerCase();
    const password = text(req.body.password);
    if (!username || !password) throw httpError(400, "Informe usuario e senha.");

    const result = await query(
      `
        SELECT id::text, username, display_name AS "displayName", password_hash, role, active
        FROM access_users
        WHERE lower(username) = $1
      `,
      [username]
    );

    const user = result.rows[0];
    if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
      throw httpError(401, "Usuario ou senha invalidos.");
    }

    const token = createToken();
    sessions.set(token, {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    });

    res.setHeader("Set-Cookie", sessionCookie(token));
    res.json({ user: publicAccessUser(sessions.get(token)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (req, res) => {
  const token = getCookie(req, "cl_session");
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", "cl_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicAccessUser(req.accessUser) });
});

app.put("/api/auth/me", requireAuth, async (req, res, next) => {
  try {
    const username = requiredText(req.body.username, "Usuario").toLowerCase();
    const displayName = text(req.body.displayName);
    const currentPassword = text(req.body.currentPassword);
    const newPassword = text(req.body.newPassword);

    const current = await query(
      `
        SELECT id::text, username, display_name AS "displayName", password_hash, role, active
        FROM access_users
        WHERE id = $1
      `,
      [req.accessUser.id]
    );
    const user = current.rows[0];
    if (!user || !user.active) throw httpError(401, "Login necessario.");

    if (newPassword && !verifyPassword(currentPassword, user.password_hash)) {
      throw httpError(400, "Senha atual invalida.");
    }

    const params = [username, displayName, req.accessUser.id];
    let sql = `
      UPDATE access_users
      SET username = $1,
          display_name = $2,
          updated_at = now()
      WHERE id = $3
      RETURNING id::text, username, display_name AS "displayName", role, active
    `;

    if (newPassword) {
      params.splice(2, 0, hashPassword(newPassword));
      sql = `
        UPDATE access_users
        SET username = $1,
            display_name = $2,
            password_hash = $3,
            updated_at = now()
        WHERE id = $4
        RETURNING id::text, username, display_name AS "displayName", role, active
      `;
    }

    const updated = await query(sql, params);
    const nextUser = updated.rows[0];
    req.accessUser.username = nextUser.username;
    req.accessUser.displayName = nextUser.displayName;
    req.accessUser.role = nextUser.role;
    await logAudit(req.accessUser, "Alteracao", "Minha conta", req.accessUser.id, "Dados da propria conta atualizados");
    res.json({ user: publicAccessUser(req.accessUser) });
  } catch (error) {
    if (error.code === "23505") {
      next(httpError(400, "Este usuario de login ja esta em uso."));
      return;
    }
    next(error);
  }
});

app.get("/api/data", requireAuth, async (req, res, next) => {
  try {
    const [licenses, users, assignments, financialItems] = await Promise.all([
      query(`
        SELECT
          id::text,
          software,
          vendor,
          type,
          license_key AS key,
          seats,
          to_char(expires_at, 'YYYY-MM-DD') AS "expiresAt",
          supplier,
          notes,
          created_by::text AS "createdBy"
        FROM licenses
        ORDER BY software, license_key
      `),
      query(`
        SELECT
          id::text,
          name,
          email,
          department,
          device,
          status,
          created_by::text AS "createdBy"
        FROM users_app
        ORDER BY name
      `),
      query(`
        SELECT
          id::text,
          license_id::text AS "licenseId",
          user_id::text AS "userId",
          to_char(start_date, 'YYYY-MM-DD') AS "startDate",
          to_char(return_date, 'YYYY-MM-DD') AS "returnDate",
          status,
          notes,
          created_by::text AS "createdBy"
        FROM assignments
        ORDER BY start_date DESC, created_at DESC
      `),
      query(`
        SELECT
          id::text,
          license_id::text AS "licenseId",
          setor,
          categoria,
          fornecedor,
          filial,
          nf,
          boleto::float AS boleto,
          to_char(data_emissao, 'YYYY-MM-DD') AS "dataEmissao",
          to_char(data_vencimento, 'YYYY-MM-DD') AS "dataVencimento",
          status_pagamento AS status,
          observacoes,
          cod_fornecedor AS "codFornecedor",
          nome_fornecedor AS "nomeFornecedor",
          ap,
          alerta,
          ap_localizada AS "apLocalizada",
          motivo_alerta AS "motivoAlerta",
          enviar_alerta AS "enviarAlerta",
          created_by::text AS "createdBy"
        FROM financial_items
        ORDER BY data_vencimento NULLS LAST, fornecedor, nf
      `)
    ]);

    res.json({
      licenses: licenses.rows.map(normalizeDateFields),
      users: users.rows,
      assignments: assignments.rows.map(normalizeDateFields),
      financialItems: financialItems.rows.map(normalizeDateFields)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/financial-items/import", requireOperator, async (req, res, next) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items.map(cleanFinancialItem) : [];
    if (!items.length) throw httpError(400, "Nenhum item financeiro informado.");
    let matched = 0;

    await transaction(async (client) => {
      for (const item of items) {
        const enriched = await enrichFinancialItemFromMega(item);
        if (enriched.matched) matched += 1;
        await upsertFinancialItem(client, enriched.item, req.accessUser);
      }
    });

    await logAudit(req.accessUser, "Importacao", "Financeiro", "", `${items.length} itens processados via CSV`);
    res.json({ ok: true, imported: items.length, matched });
  } catch (error) {
    next(error);
  }
});

app.post("/api/financial-items", requireOperator, async (req, res, next) => {
  try {
    const item = cleanFinancialItem(req.body);
    const result = await query(
      `
        INSERT INTO financial_items (
          license_id, setor, categoria, fornecedor, filial, nf, boleto, data_emissao, data_vencimento,
          status_pagamento, observacoes, cod_fornecedor, nome_fornecedor, ap, alerta, ap_localizada,
          motivo_alerta, enviar_alerta, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING id::text
      `,
      [...financialParams(item), req.accessUser.id]
    );
    await logAudit(req.accessUser, "Cadastro", "Financeiro", result.rows[0].id, item.fornecedor || item.nf);
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

app.put("/api/financial-items/:id", requireOperator, async (req, res, next) => {
  try {
    const item = cleanFinancialItem(req.body);
    await assertCanModifyRecord("financial_items", req.params.id, req.accessUser);
    const result = await query(
      `
        UPDATE financial_items
        SET license_id = $1,
            setor = $2,
            categoria = $3,
            fornecedor = $4,
            filial = $5,
            nf = $6,
            boleto = $7,
            data_emissao = $8,
            data_vencimento = $9,
            status_pagamento = $10,
            observacoes = $11,
            cod_fornecedor = $12,
            nome_fornecedor = $13,
            ap = $14,
            alerta = $15,
            ap_localizada = $16,
            motivo_alerta = $17,
            enviar_alerta = $18,
            updated_at = now()
        WHERE id = $19
      `,
      [...financialParams(item), req.params.id]
    );
    await logAudit(req.accessUser, "Alteracao", "Financeiro", req.params.id, item.fornecedor || item.nf);
    sendMutationResult(res, result.rowCount);
  } catch (error) {
    next(error);
  }
});

app.post("/api/financial-items/lookup-mega", requireOperator, async (req, res, next) => {
  try {
    const input = {
      ...req.body,
      fornecedor: text(req.body.fornecedor) || "Consulta MEGA"
    };
    const enriched = await enrichFinancialItemFromMega(cleanFinancialItem(input));
    res.json(enriched);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/financial-items/:id", requireOperator, async (req, res, next) => {
  try {
    await assertCanModifyRecord("financial_items", req.params.id, req.accessUser);
    const result = await query("DELETE FROM financial_items WHERE id = $1", [req.params.id]);
    await logAudit(req.accessUser, "Exclusao", "Financeiro", req.params.id, "Boleto financeiro removido");
    sendMutationResult(res, result.rowCount);
  } catch (error) {
    next(error);
  }
});

app.post("/api/financial-items/sync-mega", requireOperator, async (req, res, next) => {
  try {
    const items = await query(`
      SELECT
        id::text,
        nf,
        cod_fornecedor AS "codFornecedor",
        to_char(data_vencimento, 'YYYY-MM-DD') AS "dataVencimento"
      FROM financial_items
      ${isAdminUser(req.accessUser) ? "" : "WHERE created_by = $1"}
    `, isAdminUser(req.accessUser) ? [] : [req.accessUser.id]);

    let updated = 0;
    let matched = 0;
    let megaRows = 0;

    await transaction(async (client) => {
      for (const item of items.rows) {
        const rows = await fetchMegaRowsForItem(item);
        megaRows += rows.length;
        const mega = rows[0] || null;
        if (!mega) {
          await client.query(
            `
              UPDATE financial_items
              SET ap_localizada = 'Não',
                  status_pagamento = CASE WHEN status_pagamento = 'Pago' THEN status_pagamento ELSE 'Aguardando Pagamento' END,
                  alerta = $4,
                  motivo_alerta = $2,
                  enviar_alerta = $3,
                  updated_at = now()
              WHERE id = $1
            `,
            [
              item.id,
              financialReasonLabel(item.dataVencimento, "Aguardando Pagamento", "Não"),
              shouldSendFinancialAlert(item.dataVencimento, "Aguardando Pagamento") ? "Sim" : "Não",
              financialAlertLabel(item.dataVencimento, "Aguardando Pagamento")
            ]
          );
          updated += 1;
          continue;
        }

        matched += 1;
        const status = normalizeMegaStatus(mega.AP_STATUS || mega.STATUS_AP);
        const ap = formatMegaAp(mega.AP);
        const apLocalizada = ap ? "Sim" : "Não";

        await client.query(
          `
            UPDATE financial_items
            SET ap = $2,
                status_pagamento = $3,
                ap_localizada = $4,
                alerta = $5,
                motivo_alerta = $6,
                enviar_alerta = $7,
                filial = $8,
                nome_fornecedor = $9,
                updated_at = now()
            WHERE id = $1
          `,
          [
            item.id,
            ap,
            status,
            apLocalizada,
            financialAlertLabel(item.dataVencimento, status),
            financialReasonLabel(item.dataVencimento, status, apLocalizada),
            shouldSendFinancialAlert(item.dataVencimento, status) ? "Sim" : "Não",
            formatMegaBranch(mega),
            text(mega.FORNECEDOR)
          ]
        );
        updated += 1;
      }
    });

    await logAudit(req.accessUser, "Atualizacao MEGA", "Financeiro", "", `${updated} itens atualizados; ${matched} correspondencias`);
    res.json({ ok: true, megaRows, matched, updated });
  } catch (error) {
    next(error);
  }
});

app.post("/api/financial-items/send-alerts", requireAdmin, async (req, res, next) => {
  try {
    const items = await getFinancialAlertItems();
    const settings = await getEmailSettings();
    const result = await sendFinancialAlertEmail(items, settings);
    await logAudit(req.accessUser, "Envio", "Alertas financeiros", "", `${items.length} boletos avaliados`);
    res.json({ ok: true, ...result, count: items.length });
  } catch (error) {
    next(error);
  }
});

app.get("/api/settings/email", requireAdmin, async (req, res, next) => {
  try {
    res.json({ settings: await getPublicEmailSettings() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/audit-logs", requireAdmin, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        id::text,
        user_id::text AS "userId",
        username,
        display_name AS "displayName",
        action,
        entity,
        entity_id AS "entityId",
        details,
        to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt"
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT 500
    `);
    res.json({ auditLogs: result.rows });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/audit-logs", requireAdmin, async (req, res, next) => {
  try {
    await query("DELETE FROM audit_logs");
    await logAudit(req.accessUser, "Exclusao", "Auditoria", "", "LOG de auditoria limpo");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings/email", requireAdmin, async (req, res, next) => {
  try {
    const current = await getEmailSettings();
    const settings = cleanEmailSettings(req.body, current);
    await saveEmailSettings(settings);
    await logAudit(req.accessUser, "Alteracao", "Configuracoes SMTP", "", "Configuracoes de e-mail atualizadas");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/licenses", requireOperator, async (req, res, next) => {
  try {
    const license = cleanLicense(req.body);
    await assertUniqueLicense(license);
    const result = await query(
      `
        INSERT INTO licenses (software, vendor, type, license_key, seats, expires_at, supplier, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id::text
      `,
      [
        license.software,
        license.vendor,
        license.type,
        license.key,
        license.seats,
        nullableDate(license.expiresAt),
        license.supplier,
        license.notes,
        req.accessUser.id
      ]
    );
    await logAudit(req.accessUser, "Cadastro", "Licencas", result.rows[0].id, license.software);
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

app.put("/api/licenses/:id", requireOperator, async (req, res, next) => {
  try {
    const license = cleanLicense(req.body);
    await assertCanModifyRecord("licenses", req.params.id, req.accessUser);
    const result = await query(
      `
        UPDATE licenses
        SET software = $1,
            vendor = $2,
            type = $3,
            license_key = $4,
            seats = $5,
            expires_at = $6,
            supplier = $7,
            notes = $8,
            updated_at = now()
        WHERE id = $9
      `,
      [
        license.software,
        license.vendor,
        license.type,
        license.key,
        license.seats,
        nullableDate(license.expiresAt),
        license.supplier,
        license.notes,
        req.params.id
      ]
    );
    await logAudit(req.accessUser, "Alteracao", "Licencas", req.params.id, license.software);
    sendMutationResult(res, result.rowCount);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/licenses/:id", requireOperator, async (req, res, next) => {
  try {
    await assertCanModifyRecord("licenses", req.params.id, req.accessUser);
    await assertCanDeleteLicense(req.params.id, req.accessUser);
    const result = await query("DELETE FROM licenses WHERE id = $1", [req.params.id]);
    await logAudit(req.accessUser, "Exclusao", "Licencas", req.params.id, "Licenca removida");
    sendMutationResult(res, result.rowCount);
  } catch (error) {
    next(error);
  }
});

app.post("/api/users", requireOperator, async (req, res, next) => {
  try {
    const user = cleanUser(req.body);
    await assertUniqueAppUser(user);
    const result = await query(
      `
        INSERT INTO users_app (name, email, department, device, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id::text
      `,
      [user.name, user.email, user.department, user.device, user.status, req.accessUser.id]
    );
    await logAudit(req.accessUser, "Cadastro", "Usuarios", result.rows[0].id, user.name);
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

app.put("/api/users/:id", requireOperator, async (req, res, next) => {
  try {
    const user = cleanUser(req.body);
    await assertCanModifyRecord("users_app", req.params.id, req.accessUser);
    const result = await query(
      `
        UPDATE users_app
        SET name = $1,
            email = $2,
            department = $3,
            device = $4,
            status = $5,
            updated_at = now()
        WHERE id = $6
      `,
      [user.name, user.email, user.department, user.device, user.status, req.params.id]
    );
    await logAudit(req.accessUser, "Alteracao", "Usuarios", req.params.id, user.name);
    sendMutationResult(res, result.rowCount);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/users/:id", requireOperator, async (req, res, next) => {
  try {
    await assertCanModifyRecord("users_app", req.params.id, req.accessUser);
    await assertCanDeleteUser(req.params.id, req.accessUser);
    const result = await query("DELETE FROM users_app WHERE id = $1", [req.params.id]);
    await logAudit(req.accessUser, "Exclusao", "Usuarios", req.params.id, "Usuario removido");
    sendMutationResult(res, result.rowCount);
  } catch (error) {
    next(error);
  }
});

app.post("/api/assignments", requireOperator, async (req, res, next) => {
  try {
    const assignment = cleanAssignment(req.body);
    await assertUniqueAssignment(assignment);
    const id = await saveAssignmentWithCapacityCheck(assignment, null, req.accessUser);
    await logAudit(req.accessUser, "Cadastro", "Vinculos", id, "Vinculo criado");
    res.status(201).json({ id });
  } catch (error) {
    next(error);
  }
});

app.put("/api/assignments/:id", requireOperator, async (req, res, next) => {
  try {
    const assignment = cleanAssignment(req.body);
    await saveAssignmentWithCapacityCheck(assignment, req.params.id, req.accessUser);
    await logAudit(req.accessUser, "Alteracao", "Vinculos", req.params.id, "Vinculo atualizado");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/assignments/:id", requireOperator, async (req, res, next) => {
  try {
    await assertCanModifyRecord("assignments", req.params.id, req.accessUser);
    const result = await query("DELETE FROM assignments WHERE id = $1", [req.params.id]);
    await logAudit(req.accessUser, "Exclusao", "Vinculos", req.params.id, "Vinculo removido");
    sendMutationResult(res, result.rowCount);
  } catch (error) {
    next(error);
  }
});

app.get("/api/access-users", requireAdmin, async (req, res, next) => {
  try {
    const result = await query(
      `
        SELECT id::text, username, email, display_name AS "displayName", role, active
        FROM access_users
        ORDER BY username
      `
    );
    res.json({ accessUsers: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/access-users", requireAdmin, async (req, res, next) => {
  try {
    const user = cleanAccessUser(req.body, true);
    await assertUniqueAccessUser(user);
    const result = await query(
      `
        INSERT INTO access_users (username, email, display_name, password_hash, role, active)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id::text
      `,
      [user.username, user.email, user.displayName, hashPassword(user.password), user.role, user.active]
    );
    await logAudit(req.accessUser, "Cadastro", "Acessos", result.rows[0].id, user.username);
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

app.put("/api/access-users/:id", requireAdmin, async (req, res, next) => {
  try {
    const user = cleanAccessUser(req.body, false);
    await assertUniqueAccessUser(user, req.params.id);
    const params = [user.username, user.email, user.displayName, user.role, user.active, req.params.id];
    let sql = `
      UPDATE access_users
      SET username = $1,
          email = $2,
          display_name = $3,
          role = $4,
          active = $5,
          updated_at = now()
      WHERE id = $6
    `;

    if (user.password) {
      params.splice(5, 0, hashPassword(user.password));
      sql = `
        UPDATE access_users
        SET username = $1,
            email = $2,
            display_name = $3,
            role = $4,
            active = $5,
            password_hash = $6,
            updated_at = now()
        WHERE id = $7
      `;
    }

    const result = await query(sql, params);
    await logAudit(req.accessUser, "Alteracao", "Acessos", req.params.id, user.username);
    sendMutationResult(res, result.rowCount);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/access-users/:id", requireAdmin, async (req, res, next) => {
  try {
    if (req.params.id === req.accessUser.id) {
      throw httpError(400, "Voce nao pode excluir o proprio acesso.");
    }
    const result = await query("DELETE FROM access_users WHERE id = $1", [req.params.id]);
    await logAudit(req.accessUser, "Exclusao", "Acessos", req.params.id, "Acesso removido");
    sendMutationResult(res, result.rowCount);
  } catch (error) {
    next(error);
  }
});

app.post("/api/sample-data", requireAdmin, async (req, res, next) => {
  try {
    await transaction(async (client) => {
      const existing = await client.query("SELECT COUNT(*)::int AS total FROM licenses");
      if (existing.rows[0].total > 0) return;

      const licenseOne = await client.query(
        `
          INSERT INTO licenses (software, vendor, type, license_key, seats, expires_at, supplier)
          VALUES ('AutoCAD', 'Autodesk', 'Usuarios nomeados', 'ACD-2026-001', 3, CURRENT_DATE + INTERVAL '45 days', 'Revenda CAD')
          RETURNING id
        `
      );
      const licenseTwo = await client.query(
        `
          INSERT INTO licenses (software, vendor, type, license_key, seats, expires_at, supplier)
          VALUES ('AutoCAD', 'Autodesk', 'Serial', 'ACD-2026-002', 1, CURRENT_DATE + INTERVAL '120 days', 'Revenda CAD')
          RETURNING id
        `
      );
      const licenseThree = await client.query(
        `
          INSERT INTO licenses (software, vendor, type, license_key, seats, expires_at, supplier)
          VALUES ('Microsoft 365', 'Microsoft', 'Assinatura', 'M365-BUS-010', 10, CURRENT_DATE + INTERVAL '280 days', 'Portal Microsoft')
          RETURNING id
        `
      );
      const userOne = await client.query(
        `
          INSERT INTO users_app (name, email, department, device, status)
          VALUES ('Ana Silva', 'ana.silva@empresa.com', 'Projetos', 'Notebook AN-014', 'Ativo')
          RETURNING id
        `
      );
      const userTwo = await client.query(
        `
          INSERT INTO users_app (name, email, department, device, status)
          VALUES ('Carlos Souza', 'carlos.souza@empresa.com', 'Engenharia', 'Desktop EN-021', 'Ativo')
          RETURNING id
        `
      );

      await client.query(
        `
          INSERT INTO assignments (license_id, user_id, start_date, status)
          VALUES ($1, $2, CURRENT_DATE, 'Em uso'), ($3, $4, CURRENT_DATE, 'Em uso')
        `,
        [licenseOne.rows[0].id, userOne.rows[0].id, licenseThree.rows[0].id, userTwo.rows[0].id]
      );
    });

    await logAudit(req.accessUser, "Cadastro", "Dados de exemplo", "", "Dados de exemplo inseridos");
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/import", requireAdmin, async (req, res, next) => {
  try {
    const data = req.body || {};
    const licenses = Array.isArray(data.licenses) ? data.licenses.map(cleanLicense) : [];
    const users = Array.isArray(data.users) ? data.users.map(cleanUser) : [];
    const assignments = Array.isArray(data.assignments) ? data.assignments.map(cleanAssignment) : [];

    await transaction(async (client) => {
      await client.query("DELETE FROM assignments");
      await client.query("DELETE FROM users_app");
      await client.query("DELETE FROM licenses");

      const licenseMap = new Map();
      const userMap = new Map();

      for (const license of licenses) {
        const result = await client.query(
          `
            INSERT INTO licenses (software, vendor, type, license_key, seats, expires_at, supplier, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id::text
          `,
          [license.software, license.vendor, license.type, license.key, license.seats, nullableDate(license.expiresAt), license.supplier, license.notes]
        );
        licenseMap.set(license.id, result.rows[0].id);
      }

      for (const user of users) {
        const result = await client.query(
          `
            INSERT INTO users_app (name, email, department, device, status)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id::text
          `,
          [user.name, user.email, user.department, user.device, user.status]
        );
        userMap.set(user.id, result.rows[0].id);
      }

      for (const assignment of assignments) {
        const licenseId = licenseMap.get(assignment.licenseId);
        const userId = userMap.get(assignment.userId);
        if (!licenseId || !userId) continue;
        await client.query(
          `
            INSERT INTO assignments (license_id, user_id, start_date, return_date, status, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [licenseId, userId, nullableDate(assignment.startDate) || new Date(), nullableDate(assignment.returnDate), assignment.status, assignment.notes]
        );
      }
    });

    await logAudit(req.accessUser, "Importacao", "Backup JSON", "", "Base importada por arquivo JSON");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  res.status(status).json({
    error: error.message || "Erro interno do servidor"
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`G-Control rodando em http://localhost:${port}`);
  migrateStoredSecrets().catch((error) => console.error(`Falha ao proteger configuracoes: ${error.message}`));
  startFinancialAlertScheduler();
});

function requireAuth(req, res, next) {
  const token = getCookie(req, "cl_session");
  const accessUser = token ? sessions.get(token) : null;
  if (!accessUser) {
    next(httpError(401, "Login necessario."));
    return;
  }
  req.accessUser = accessUser;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }
    if (req.accessUser.role !== "admin") {
      next(httpError(403, "Acesso permitido apenas para administradores."));
      return;
    }
    next();
  });
}

function requireOperator(req, res, next) {
  requireAuth(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }
    if (!["admin", "member"].includes(req.accessUser.role)) {
      next(httpError(403, "Acesso permitido apenas para administradores ou membros."));
      return;
    }
    next();
  });
}

function isAdminUser(user) {
  return user?.role === "admin";
}

async function assertCanModifyRecord(table, id, user) {
  const allowedTables = new Set(["licenses", "users_app", "assignments", "financial_items"]);
  if (!allowedTables.has(table)) throw httpError(500, "Tabela sem regra de permissao.");
  const result = await query(`SELECT created_by::text AS "createdBy" FROM ${table} WHERE id = $1`, [id]);
  if (!result.rowCount) throw httpError(404, "Registro nao encontrado.");
  const ownerId = result.rows[0].createdBy;
  if (!isAdminUser(user) && ownerId !== user.id) {
    throw httpError(403, "Voce so pode alterar ou excluir informacoes cadastradas por voce.");
  }
}

async function assertCanDeleteLicense(id, user) {
  if (isAdminUser(user)) return;
  const result = await query(
    `
      SELECT
        (
          SELECT COUNT(*)::int
          FROM assignments
          WHERE license_id = $1
            AND created_by IS DISTINCT FROM $2::uuid
        ) +
        (
          SELECT COUNT(*)::int
          FROM financial_items
          WHERE license_id = $1
            AND created_by IS DISTINCT FROM $2::uuid
        ) AS total
    `,
    [id, user.id]
  );
  if (Number(result.rows[0].total) > 0) {
    throw httpError(403, "Esta licenca possui registros de outros usuarios vinculados. Somente Admin pode excluir.");
  }
}

async function assertCanDeleteUser(id, user) {
  if (isAdminUser(user)) return;
  const result = await query(
    `
      SELECT COUNT(*)::int AS total
      FROM assignments
      WHERE user_id = $1
        AND created_by IS DISTINCT FROM $2::uuid
    `,
    [id, user.id]
  );
  if (Number(result.rows[0].total) > 0) {
    throw httpError(403, "Este usuario possui vinculos de outros usuarios. Somente Admin pode excluir.");
  }
}

async function assertUniqueLicense(license) {
  if (!text(license.key)) return;
  const result = await query(
    "SELECT id FROM licenses WHERE lower(license_key) = lower($1) LIMIT 1",
    [license.key]
  );
  if (result.rowCount) {
    throw httpError(409, `A chave/serial "${license.key}" ja existe.`);
  }
}

async function assertUniqueAppUser(user) {
  const result = await query(
    "SELECT id FROM users_app WHERE lower(email) = lower($1) LIMIT 1",
    [user.email]
  );
  if (result.rowCount) {
    throw httpError(409, `O e-mail/login "${user.email}" ja existe.`);
  }
}

async function assertUniqueAssignment(assignment) {
  const result = await query(
    `
      SELECT id
      FROM assignments
      WHERE license_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [assignment.licenseId, assignment.userId]
  );
  if (result.rowCount) {
    throw httpError(409, "Este vinculo entre usuario e licenca ja existe.");
  }
}

async function assertUniqueAccessUser(user, ignoredId = null) {
  const usernameResult = await query(
    `
      SELECT id
      FROM access_users
      WHERE lower(username) = lower($1)
        AND ($2::uuid IS NULL OR id <> $2::uuid)
      LIMIT 1
    `,
    [user.username, ignoredId]
  );
  if (usernameResult.rowCount) {
    throw httpError(409, `O usuario de login "${user.username}" ja existe.`);
  }

  if (!user.email) return;

  const emailResult = await query(
    `
      SELECT id
      FROM access_users
      WHERE lower(email) = lower($1)
        AND ($2::uuid IS NULL OR id <> $2::uuid)
      LIMIT 1
    `,
    [user.email, ignoredId]
  );
  if (emailResult.rowCount) {
    throw httpError(409, `O e-mail "${user.email}" ja existe.`);
  }
}

async function saveAssignmentWithCapacityCheck(assignment, assignmentId, accessUser) {
  return transaction(async (client) => {
    if (assignmentId) {
      await assertCanModifyRecord("assignments", assignmentId, accessUser);
    }
    const licenseResult = await client.query("SELECT seats, type FROM licenses WHERE id = $1", [assignment.licenseId]);
    if (!licenseResult.rowCount) throw httpError(400, "Licenca nao encontrada.");
    if (isSimultaneousLicenseType(licenseResult.rows[0].type)) {
      throw httpError(400, "Licencas de Usuarios simultaneos nao precisam de vinculo por usuario.");
    }

    const userResult = await client.query("SELECT id FROM users_app WHERE id = $1", [assignment.userId]);
    if (!userResult.rowCount) throw httpError(400, "Usuario nao encontrado.");

    if (isActiveAssignment(assignment)) {
      const countResult = await client.query(
        `
          SELECT COUNT(*)::int AS total
          FROM assignments
          WHERE license_id = $1
            AND status IN ('Em uso', 'Reservada')
            AND ($2::uuid IS NULL OR id <> $2::uuid)
        `,
        [assignment.licenseId, assignmentId || null]
      );

      if (countResult.rows[0].total >= licenseResult.rows[0].seats) {
        throw httpError(409, "Esta licenca ja atingiu a quantidade contratada.");
      }
    }

    if (assignmentId) {
      const result = await client.query(
        `
          UPDATE assignments
          SET license_id = $1,
              user_id = $2,
              start_date = $3,
              return_date = $4,
              status = $5,
              notes = $6,
              updated_at = now()
          WHERE id = $7
        `,
        [
          assignment.licenseId,
          assignment.userId,
          nullableDate(assignment.startDate) || new Date(),
          nullableDate(assignment.returnDate),
          assignment.status,
          assignment.notes,
          assignmentId
        ]
      );
      if (!result.rowCount) throw httpError(404, "Vinculo nao encontrado.");
      return assignmentId;
    }

    const result = await client.query(
      `
        INSERT INTO assignments (license_id, user_id, start_date, return_date, status, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id::text
      `,
      [
        assignment.licenseId,
        assignment.userId,
        nullableDate(assignment.startDate) || new Date(),
        nullableDate(assignment.returnDate),
        assignment.status,
        assignment.notes,
        accessUser.id
      ]
    );

    return result.rows[0].id;
  });
}

function cleanLicense(input) {
  return {
    id: String(input.id || ""),
    software: requiredText(input.software, "Software"),
    vendor: text(input.vendor),
    type: requiredText(input.type, "Tipo"),
    key: text(input.key),
    seats: Math.max(1, Number(input.seats) || 1),
    expiresAt: text(input.expiresAt),
    supplier: text(input.supplier),
    notes: text(input.notes)
  };
}

function cleanUser(input) {
  return {
    id: String(input.id || ""),
    name: requiredText(input.name, "Nome"),
    email: requiredText(input.email, "E-mail ou login"),
    department: text(input.department),
    device: text(input.device),
    status: text(input.status) || "Ativo"
  };
}

function cleanAssignment(input) {
  return {
    id: String(input.id || ""),
    licenseId: requiredText(input.licenseId, "Licenca"),
    userId: requiredText(input.userId, "Usuario"),
    startDate: text(input.startDate),
    returnDate: text(input.returnDate),
    status: text(input.status) || "Em uso",
    notes: text(input.notes)
  };
}

function cleanFinancialItem(input) {
  return {
    licenseId: text(input.licenseId),
    setor: text(input.setor),
    categoria: text(input.categoria),
    fornecedor: requiredText(input.fornecedor, "Fornecedor"),
    filial: text(input.filial),
    nf: text(input.nf),
    boleto: Number(input.boleto) || 0,
    dataEmissao: text(input.dataEmissao),
    dataVencimento: text(input.dataVencimento),
    status: text(input.status),
    observacoes: text(input.observacoes),
    codFornecedor: text(input.codFornecedor),
    nomeFornecedor: text(input.nomeFornecedor),
    ap: text(input.ap),
    alerta: text(input.alerta),
    apLocalizada: text(input.apLocalizada),
    motivoAlerta: text(input.motivoAlerta),
    enviarAlerta: text(input.enviarAlerta)
  };
}

function normalizeMegaRows(rows) {
  return rows.map((row) => {
    const normalized = {};
    Object.entries(row).forEach(([key, value]) => {
      normalized[key.toUpperCase()] = value == null ? "" : String(value).trim();
    });
    return normalized;
  });
}

function findMegaMatch(item, rows) {
  const nf = text(item.nf);
  const codFornecedor = text(item.codFornecedor);
  if (!nf) return null;

  if (codFornecedor) {
    const exact = rows.find((row) => text(row.NOTA_FISCAL) === nf && text(row.COD_FORNECEDOR) === codFornecedor);
    if (exact) return exact;
  }

  return rows.find((row) => text(row.NOTA_FISCAL) === nf) || null;
}

async function enrichFinancialItemFromMega(item) {
  if (!text(item.nf) || !text(item.codFornecedor)) return { item: withCalculatedFinancialFields(item), matched: false };
  const megaRows = await fetchMegaRowsForItem(item);
  return enrichFinancialItemWithMega(item, megaRows);
}

async function fetchMegaRowsForItem(item) {
  if (!text(item.nf) || !text(item.codFornecedor)) return [];
  return normalizeMegaRows(await fetchMegaApRows({
    nf: item.nf,
    codFornecedor: item.codFornecedor
  }));
}

function enrichFinancialItemWithMega(item, megaRows) {
  if (!text(item.nf)) return { item: withCalculatedFinancialFields(item), matched: false };
  const mega = findMegaMatch(item, megaRows);
  const updated = { ...item };

  if (!mega) {
    updated.ap = "";
    updated.status = "Aguardando Pagamento";
    updated.apLocalizada = "Não";
    updated.alerta = financialAlertLabel(updated.dataVencimento, updated.status);
    updated.motivoAlerta = financialReasonLabel(updated.dataVencimento, updated.status, updated.apLocalizada);
    updated.enviarAlerta = shouldSendFinancialAlert(updated.dataVencimento, updated.status) ? "Sim" : "Não";
    return { item: updated, matched: false };
  }

  updated.ap = formatMegaAp(mega.AP);
  updated.status = normalizeMegaStatus(mega.AP_STATUS || mega.STATUS_AP);
  updated.apLocalizada = updated.ap ? "Sim" : "Não";
  updated.codFornecedor = updated.codFornecedor || text(mega.COD_FORNECEDOR);
  updated.nomeFornecedor = text(mega.FORNECEDOR) || updated.nomeFornecedor;
  updated.filial = formatMegaBranch(mega);
  updated.alerta = financialAlertLabel(updated.dataVencimento, updated.status);
  updated.motivoAlerta = financialReasonLabel(updated.dataVencimento, updated.status, updated.apLocalizada);
  updated.enviarAlerta = shouldSendFinancialAlert(updated.dataVencimento, updated.status) ? "Sim" : "Não";

  return { item: updated, matched: true };
}

function withCalculatedFinancialFields(item) {
  const updated = { ...item };
  updated.apLocalizada = updated.ap ? "Sim" : "Não";
  updated.status = updated.status || "Aguardando Pagamento";
  updated.alerta = financialAlertLabel(updated.dataVencimento, updated.status);
  updated.motivoAlerta = financialReasonLabel(updated.dataVencimento, updated.status, updated.apLocalizada);
  updated.enviarAlerta = shouldSendFinancialAlert(updated.dataVencimento, updated.status) ? "Sim" : "Não";
  return updated;
}

function formatMegaAp(value) {
  const ap = text(value);
  if (!ap) return "";
  return ap.toUpperCase().startsWith("AP ") ? ap : `AP ${ap}`;
}

function formatMegaBranch(mega) {
  const code = text(mega.FILIAL);
  const name = text(mega.NOME_FILIAL);
  if (code && name) return `${code} - ${name}`;
  return name || code;
}

function normalizeMegaStatus(statusAp) {
  return text(statusAp).toUpperCase() === "BAIXADA" ? "Pago" : "Aguardando Pagamento";
}

function financialReasonLabel(dateValue, status, apLocalizada) {
  if (text(status).toLowerCase() === "pago") return financialAlertLabel(dateValue, status);
  const alert = financialAlertLabel(dateValue, status);
  if (!alert) return "";
  const apText = text(apLocalizada).toLowerCase() === "sim"
    ? "AP criada, aguardando pagamento"
    : "sem AP criada/localizada";
  return `${alert} - ${apText}`;
}

async function getFinancialAlertItems() {
  const result = await query(`
    SELECT
      fornecedor AS software,
      nf,
      ap,
      to_char(data_vencimento, 'YYYY-MM-DD') AS vencimento,
      status_pagamento AS status,
      (data_vencimento - CURRENT_DATE)::int AS dias
    FROM financial_items
    WHERE data_vencimento IS NOT NULL
      AND lower(status_pagamento) = 'aguardando pagamento'
      AND (data_vencimento - CURRENT_DATE)::int <= 10
    ORDER BY data_vencimento ASC, fornecedor ASC, nf ASC
  `);

  return result.rows.map((item) => ({
    ...item,
    prazo: financialDueText(Number(item.dias))
  }));
}

async function logAudit(user, action, entity, entityId = "", details = "") {
  try {
    await query(
      `
        INSERT INTO audit_logs (user_id, username, display_name, action, entity, entity_id, details)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        user?.id || null,
        text(user?.username),
        text(user?.displayName),
        text(action),
        text(entity),
        text(entityId),
        text(details)
      ]
    );
  } catch (error) {
    console.warn(`Falha ao registrar auditoria: ${error.message}`);
  }
}

async function upsertFinancialItem(client, item, accessUser) {
  const existing = await findExistingFinancialItem(client, item);
  if (existing) {
    if (!isAdminUser(accessUser) && existing.createdBy !== accessUser.id) {
      throw httpError(403, "Voce so pode atualizar informacoes financeiras cadastradas por voce.");
    }
    await client.query(
      `
        UPDATE financial_items
        SET license_id = $1,
            setor = $2,
            categoria = $3,
            fornecedor = $4,
            filial = $5,
            nf = $6,
            boleto = $7,
            data_emissao = $8,
            data_vencimento = $9,
            status_pagamento = $10,
            observacoes = $11,
            cod_fornecedor = $12,
            nome_fornecedor = $13,
            ap = $14,
            alerta = $15,
            ap_localizada = $16,
            motivo_alerta = $17,
            enviar_alerta = $18,
            updated_at = now()
        WHERE id = $19
      `,
      [...financialParams(item), existing.id]
    );
    return "updated";
  }

  await client.query(
    `
      INSERT INTO financial_items (
        license_id, setor, categoria, fornecedor, filial, nf, boleto, data_emissao, data_vencimento,
        status_pagamento, observacoes, cod_fornecedor, nome_fornecedor, ap, alerta, ap_localizada,
        motivo_alerta, enviar_alerta, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    `,
    [...financialParams(item), accessUser.id]
  );
  return "created";
}

async function findExistingFinancialItem(client, item) {
  const nf = text(item.nf);
  const codFornecedor = text(item.codFornecedor);
  if (nf && codFornecedor) {
    const result = await client.query(
      `
        SELECT id::text, created_by::text AS "createdBy"
        FROM financial_items
        WHERE nf = $1 AND cod_fornecedor = $2
        LIMIT 1
      `,
      [nf, codFornecedor]
    );
    if (result.rowCount) return result.rows[0];
  }

  if (nf) {
    const result = await client.query(
      `
        SELECT id::text, created_by::text AS "createdBy"
        FROM financial_items
        WHERE nf = $1 AND fornecedor = $2
        LIMIT 1
      `,
      [nf, item.fornecedor]
    );
    if (result.rowCount) return result.rows[0];
  }

  return null;
}

async function getEmailSettings() {
  const defaults = {
    smtpHost: process.env.SMTP_HOST || "",
    smtpPort: process.env.SMTP_PORT || "587",
    smtpSecure: process.env.SMTP_SECURE || "false",
    smtpUser: process.env.SMTP_USER || "",
    smtpPassword: process.env.SMTP_PASSWORD || "",
    alertEmailFrom: process.env.ALERT_EMAIL_FROM || "",
    alertEmailTo: process.env.ALERT_EMAIL_TO || "",
    alertEmailEnabled: process.env.ALERT_EMAIL_ENABLED || "false",
    alertEmailTime: process.env.ALERT_EMAIL_TIME || "08:00",
    emailProvider: process.env.EMAIL_PROVIDER || "smtp",
    graphTenantId: process.env.GRAPH_TENANT_ID || "",
    graphClientId: process.env.GRAPH_CLIENT_ID || "",
    graphClientSecret: process.env.GRAPH_CLIENT_SECRET || ""
  };

  const result = await query("SELECT key, value FROM app_settings WHERE key LIKE 'email.%'");
  result.rows.forEach((row) => {
    const property = row.key.replace("email.", "");
    if (property in defaults) defaults[property] = isEmailSecretKey(property) ? decryptSecret(row.value) : row.value;
  });
  return defaults;
}

async function getPublicEmailSettings() {
  const settings = await getEmailSettings();
  return {
    ...settings,
    smtpPassword: settings.smtpPassword ? "********" : "",
    graphClientSecret: settings.graphClientSecret ? "********" : ""
  };
}

async function saveEmailSettings(settings) {
  const entries = Object.entries(settings).map(([key, value]) => [
    `email.${key}`,
    isEmailSecretKey(key) ? encryptSecret(text(value)) : text(value)
  ]);
  await transaction(async (client) => {
    for (const [key, value] of entries) {
      await client.query(
        `
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ($1, $2, now())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
        `,
        [key, value]
      );
    }
  });
}

async function migrateStoredSecrets() {
  if (!hasEncryptionKey()) return;

  const result = await query("SELECT key, value FROM app_settings WHERE key IN ('email.smtpPassword', 'email.graphClientSecret')");
  for (const row of result.rows) {
    const value = row.value || "";
    if (!value || isEncryptedSecret(value)) continue;
    await query(
      "UPDATE app_settings SET value = $1, updated_at = now() WHERE key = $2",
      [encryptSecret(value), row.key]
    );
  }
}

function cleanEmailSettings(input, current) {
  const password = text(input.smtpPassword);
  const graphClientSecret = text(input.graphClientSecret);
  const provider = text(input.emailProvider) === "graph" ? "graph" : "smtp";
  return {
    emailProvider: provider,
    smtpHost: text(input.smtpHost),
    smtpPort: text(input.smtpPort) || "587",
    smtpSecure: Boolean(input.smtpSecure) ? "true" : "false",
    smtpUser: text(input.smtpUser),
    smtpPassword: password && password !== "********" ? password : current.smtpPassword,
    graphTenantId: text(input.graphTenantId),
    graphClientId: text(input.graphClientId),
    graphClientSecret: graphClientSecret && graphClientSecret !== "********" ? graphClientSecret : current.graphClientSecret,
    alertEmailFrom: text(input.alertEmailFrom),
    alertEmailTo: text(input.alertEmailTo),
    alertEmailEnabled: Boolean(input.alertEmailEnabled) ? "true" : "false",
    alertEmailTime: text(input.alertEmailTime) || "08:00"
  };
}

function isEmailSecretKey(key) {
  return key === "smtpPassword" || key === "graphClientSecret";
}

function financialDueText(days) {
  if (days < 0) return `Vencido ha ${Math.abs(days)} dia(s)`;
  if (days === 0) return "Vence hoje";
  return `Faltam ${days} dia(s)`;
}

function financialAlertLabel(dateValue, status) {
  if (text(status).toLowerCase() === "pago") return "OK";
  const parsed = parseDateValue(dateValue);
  if (!parsed) return "";
  const days = daysUntil(parsed);
  if (days < 0) return `Vencido ha ${Math.abs(days)} dias`;
  if (days === 0) return "Vence hoje";
  return `Vence em ${days} dias`;
}

function shouldSendFinancialAlert(dateValue, status) {
  if (text(status).toLowerCase() === "pago") return false;
  const parsed = parseDateValue(dateValue);
  return Boolean(parsed) && daysUntil(parsed) <= 10;
}

function daysUntil(value) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${value}T00:00:00`);
  return Math.ceil((target - today) / 86400000);
}

function financialParams(item) {
  return [
    nullableUuid(item.licenseId),
    item.setor,
    item.categoria,
    item.fornecedor,
    item.filial,
    item.nf,
    item.boleto,
    nullableDate(item.dataEmissao),
    nullableDate(item.dataVencimento),
    item.status,
    item.observacoes,
    item.codFornecedor,
    item.nomeFornecedor,
    item.ap,
    item.alerta,
    item.apLocalizada,
    item.motivoAlerta,
    item.enviarAlerta
  ];
}

function cleanAccessUser(input, requirePassword) {
  const password = text(input.password);
  const confirmPassword = text(input.confirmPassword);
  if (requirePassword && !password) throw httpError(400, "Senha e obrigatoria.");
  if ((password || confirmPassword) && password !== confirmPassword) {
    throw httpError(400, "A confirmacao da senha nao confere.");
  }
  const role = text(input.role) || "viewer";
  if (!["admin", "member", "viewer"].includes(role)) throw httpError(400, "Perfil invalido.");

  return {
    username: requiredText(input.username, "Usuario").toLowerCase(),
    email: text(input.email).toLowerCase(),
    displayName: text(input.displayName),
    password,
    role,
    active: Boolean(input.active)
  };
}

function requiredText(value, field) {
  const result = text(value);
  if (!result) throw httpError(400, `${field} e obrigatorio.`);
  return result;
}

function text(value) {
  return String(value ?? "").trim();
}

function nullableDate(value) {
  const parsed = parseDateValue(value);
  return parsed || null;
}

function nullableUuid(value) {
  const result = text(value);
  return result || null;
}

function parseDateValue(value) {
  const textValue = text(value);
  if (!textValue) return "";
  const iso = textValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso && isValidDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]))) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const br = textValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    if (isValidDateParts(year, month, day)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return "";
}

function isValidDateParts(year, month, day) {
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeDateFields(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value || ""])
  );
}

function isActiveAssignment(assignment) {
  return assignment.status === "Em uso" || assignment.status === "Reservada";
}

function isSimultaneousLicenseType(type) {
  return text(type).toLowerCase() === "usuarios simultaneos";
}

function sendMutationResult(res, rowCount) {
  if (!rowCount) {
    res.status(404).json({ error: "Registro nao encontrado." });
    return;
  }
  res.json({ ok: true });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || "").split(";").map((item) => item.trim());
  const cookie = cookies.find((item) => item.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : "";
}

function sessionCookie(token) {
  const maxAge = 60 * 60 * 8;
  return `cl_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function publicAccessUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role
  };
}

function startFinancialAlertScheduler() {
  let lastRun = "";

  const tick = async () => {
    try {
      const settings = await getEmailSettings();
      if (String(settings.alertEmailEnabled || "").toLowerCase() !== "true") return;
      if (!isEmailConfigured(settings)) {
        console.warn("Alertas por e-mail ativados, mas o envio de e-mail ainda nao esta configurado.");
        return;
      }

      const [hourText, minuteText] = String(settings.alertEmailTime || "08:00").split(":");
      const targetHour = Number(hourText) || 8;
      const targetMinute = Number(minuteText) || 0;
      const now = new Date();
      const todayKey = now.toISOString().slice(0, 10);
      if (lastRun === todayKey || now.getHours() !== targetHour || now.getMinutes() !== targetMinute) return;

      lastRun = todayKey;
      const items = await getFinancialAlertItems();
      await sendFinancialAlertEmail(items, settings);
      console.log(`Alertas financeiros processados: ${items.length}`);
    } catch (error) {
      console.error(`Falha ao enviar alertas financeiros: ${error.message}`);
    }
  };

  setInterval(tick, 60000);
  tick();
}
