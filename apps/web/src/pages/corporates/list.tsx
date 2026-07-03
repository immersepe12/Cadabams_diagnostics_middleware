import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Card, Table, Tag, Button, Space, Typography, Modal, Form, Input, Select, Radio, Checkbox, message, Tooltip, Alert, Spin,
} from "antd";
import { PlusOutlined, BankOutlined, KeyOutlined, StopOutlined, CheckCircleOutlined, LinkOutlined, UserAddOutlined, SearchOutlined } from "@ant-design/icons";
import { supabaseClient } from "../../lib/supabase";
import {
  createCorporate, updateCorporate, createLogin, listStaffUsers, resetLoginPassword, toggleLogin,
  fetchOrganizations, type CrelioOrg, type OrgMapping, type StaffUser,
} from "../../lib/api";
import { BRAND } from "../../theme";

const CENTRES = [
  { value: "KYL", label: "Kalyan Nagar" },
  { value: "JNR", label: "Jayanagar" },
  { value: "KKP", label: "Kanakapura" },
  { value: "BSK", label: "Banashankari" },
];
const CENTRE_NAME = Object.fromEntries(CENTRES.map((c) => [c.value, c.label]));

type CorpRow = {
  id: string; name: string; code: string; is_active: boolean;
  orgs: { centre_id: string; crelio_org_id: number; org_label: string | null }[];
  users: number;
};

type LiveOrg = { centre: string; orgId: number; name: string };
type SubCorp = { name: string; n: number };
type OrgGroup = {
  key: string; name: string; entries: LiveOrg[];
  linked: { corpId: string; corpName: string }[];
  orders: number;          // existing bills under this organisation's org ids
  lastOrderAt: string | null;
  refs: SubCorp[];         // corporates/referrers under this organisation (from bills)
};

// Crelio stores sub-corporates as referral entries ("Dr. C/O NIVA BUPA…") —
// strip the prefix noise for display.
const cleanRef = (s: string) => s.replace(/^Dr\.?\s*/i, "").replace(/^C\/O\s*/i, "").trim();

// Shown once after creating/resetting a login — the only time the password exists client-side.
export function showPasswordOnce(email: string, password: string) {
  Modal.success({
    title: "Login credentials — copy now",
    width: 460,
    content: (
      <div>
        <Typography.Paragraph style={{ marginBottom: 8 }}>
          This password is shown <b>once</b> and cannot be retrieved later.
        </Typography.Paragraph>
        <Typography.Paragraph copyable={{ text: `${email}\n${password}` }} style={{ marginBottom: 4 }}>
          <b>Email:</b> {email}
        </Typography.Paragraph>
        <Typography.Paragraph copyable={{ text: password }} style={{ fontSize: 16 }}>
          <b>Password:</b> <code>{password}</code>
        </Typography.Paragraph>
      </div>
    ),
  });
}

// Builder for centre → Crelio org mappings, fed by the live Crelio org list.
// (Used by the corporate detail page's org editor.)
export function OrgMappingBuilder({ value, onChange }: {
  value: OrgMapping[];
  onChange: (v: OrgMapping[]) => void;
}) {
  const [centre, setCentre] = useState<string>();
  const [orgs, setOrgs] = useState<CrelioOrg[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<number>();

  useEffect(() => {
    if (!centre) { setOrgs([]); return; }
    setLoading(true);
    fetchOrganizations(centre)
      .then(setOrgs)
      .catch((e) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [centre]);

  function add() {
    if (!centre || !picked) return;
    const org = orgs.find((o) => o.orgId === picked);
    if (!org) return;
    if (value.some((v) => v.centreId === centre && v.crelioOrgId === picked)) return;
    onChange([...value, { centreId: centre, crelioOrgId: picked, label: org.name }]);
    setPicked(undefined);
  }

  return (
    <div>
      <Space wrap style={{ marginBottom: 8 }}>
        <Select placeholder="Centre" style={{ width: 150 }} options={CENTRES} value={centre} onChange={setCentre} />
        <Select
          placeholder={centre ? "Pick the Crelio organization…" : "Select a centre first"}
          style={{ width: 300 }}
          showSearch optionFilterProp="label"
          loading={loading} disabled={!centre}
          value={picked}
          onChange={setPicked}
          options={orgs.map((o) => ({ value: o.orgId, label: `${o.name} (#${o.orgId})` }))}
        />
        <Button icon={<PlusOutlined />} onClick={add} disabled={!picked}>Add</Button>
      </Space>
      {value.length > 0 && (
        <div>
          {value.map((v, i) => (
            <Tag key={`${v.centreId}-${v.crelioOrgId}`} closable
              onClose={() => onChange(value.filter((_, j) => j !== i))}
              style={{ marginBottom: 4 }}>
              {CENTRE_NAME[v.centreId] ?? v.centreId}: {v.label ?? v.crelioOrgId} (#{v.crelioOrgId})
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
}

export function CorporatesList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CorpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<StaffUser[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [liveOrgs, setLiveOrgs] = useState<LiveOrg[]>([]);
  const [liveLoading, setLiveLoading] = useState(true);
  const [failedCentres, setFailedCentres] = useState<string[]>([]);
  const [orderCounts, setOrderCounts] = useState<Map<number, { n: number; last: string | null }>>(new Map());
  const [orgReferrals, setOrgReferrals] = useState<Map<number, SubCorp[]>>(new Map());
  const [orgSearch, setOrgSearch] = useState("");
  const [busy, setBusy] = useState(false);

  // Link-organisation modal
  const [linkGroup, setLinkGroup] = useState<OrgGroup | null>(null);
  const [linkMode, setLinkMode] = useState<"new" | "existing">("new");
  const [linkName, setLinkName] = useState("");
  const [linkCorpId, setLinkCorpId] = useState<string>();
  const [linkChecked, setLinkChecked] = useState<string[]>([]);

  // Add-login modal (corporate portal user)
  const [loginFor, setLoginFor] = useState<{ corpId: string; corpName: string } | null>(null);
  const [loginForm] = Form.useForm();

  // Legacy manual "New corporate" modal (kept for odd cases)
  const [createOpen, setCreateOpen] = useState(false);
  const [orgDraft, setOrgDraft] = useState<OrgMapping[]>([]);
  const [staffOpen, setStaffOpen] = useState(false);
  const [form] = Form.useForm();
  const [staffForm] = Form.useForm();

  async function load() {
    setLoading(true);
    const [{ data: corps }, { data: orgs }, { data: users }, { data: counts }, { data: refs }] = await Promise.all([
      supabaseClient.from("corporates").select("id, name, code, is_active").order("name"),
      supabaseClient.from("corporate_orgs").select("corporate_id, centre_id, crelio_org_id, org_label"),
      supabaseClient.from("corporate_users").select("corporate_id"),
      supabaseClient.from("org_order_counts").select("crelio_org_id, order_count, last_order_at"),
      supabaseClient.from("org_referrals").select("crelio_org_id, referral_name, order_count").limit(2000),
    ]);
    setOrderCounts(new Map((counts ?? []).map((c: any) => [Number(c.crelio_org_id), { n: c.order_count as number, last: c.last_order_at as string | null }])));
    const refMap = new Map<number, SubCorp[]>();
    for (const r of (refs ?? []) as any[]) {
      const id = Number(r.crelio_org_id);
      (refMap.get(id) ?? refMap.set(id, []).get(id)!).push({ name: String(r.referral_name), n: r.order_count as number });
    }
    setOrgReferrals(refMap);
    const byCorp = new Map<string, CorpRow>();
    for (const c of corps ?? []) byCorp.set(c.id, { ...(c as any), orgs: [], users: 0 });
    for (const o of orgs ?? []) byCorp.get((o as any).corporate_id)?.orgs.push(o as any);
    for (const u of users ?? []) { const r = byCorp.get((u as any).corporate_id); if (r) r.users++; }
    setRows([...byCorp.values()]);
    setLoading(false);
  }

  async function loadLive() {
    setLiveLoading(true);
    const results = await Promise.allSettled(
      CENTRES.map(async (c) => (await fetchOrganizations(c.value)).map((o) => ({ centre: c.value, orgId: o.orgId, name: o.name }))),
    );
    const ok: LiveOrg[] = [];
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") ok.push(...r.value);
      else failed.push(CENTRES[i].label);
    });
    setLiveOrgs(ok);
    setFailedCentres(failed);
    setLiveLoading(false);
  }

  async function loadTeam() {
    setTeamLoading(true);
    try { setTeam(await listStaffUsers()); } catch (e: any) { message.error(e.message); }
    setTeamLoading(false);
  }

  useEffect(() => { load(); loadLive(); loadTeam(); }, []);

  // Group live orgs by normalised name (the same company appears at multiple
  // centres with different Crelio org ids) and attach linked corporates.
  const orgGroups = useMemo<OrgGroup[]>(() => {
    const linkIndex = new Map<string, { corpId: string; corpName: string }>();
    for (const c of rows) for (const o of c.orgs) linkIndex.set(`${o.centre_id}:${o.crelio_org_id}`, { corpId: c.id, corpName: c.name });

    const byName = new Map<string, OrgGroup>();
    for (const o of liveOrgs) {
      const key = o.name.trim().toUpperCase();
      const g = byName.get(key) ?? { key, name: o.name.trim(), entries: [], linked: [], orders: 0, lastOrderAt: null, refs: [] };
      g.entries.push(o);
      byName.set(key, g);
    }
    for (const g of byName.values()) {
      const seen = new Set<string>();
      const refAgg = new Map<string, SubCorp>();
      for (const e of g.entries) {
        const l = linkIndex.get(`${e.centre}:${e.orgId}`);
        if (l && !seen.has(l.corpId)) { g.linked.push(l); seen.add(l.corpId); }
        const c = orderCounts.get(e.orgId);
        if (c) {
          g.orders += c.n;
          if (c.last && (!g.lastOrderAt || c.last > g.lastOrderAt)) g.lastOrderAt = c.last;
        }
        for (const r of orgReferrals.get(e.orgId) ?? []) {
          const name = cleanRef(r.name) || r.name;
          const agg = refAgg.get(name.toUpperCase());
          if (agg) agg.n += r.n;
          else refAgg.set(name.toUpperCase(), { name, n: r.n });
        }
      }
      g.refs = [...refAgg.values()].sort((a, b) => b.n - a.n);
      g.entries.sort((a, b) => a.centre.localeCompare(b.centre));
    }
    const term = orgSearch.trim().toUpperCase();
    // Active clients (most orders) first, then alphabetical.
    return [...byName.values()]
      .filter((g) => !term || g.key.includes(term))
      .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name));
  }, [liveOrgs, rows, orgSearch, orderCounts, orgReferrals]);

  function openLink(g: OrgGroup) {
    setLinkGroup(g);
    setLinkMode("new");
    setLinkName(g.name);
    setLinkCorpId(undefined);
    setLinkChecked(g.entries.map((e) => `${e.centre}:${e.orgId}`));
  }

  async function submitLink() {
    if (!linkGroup) return;
    const chosen = linkGroup.entries.filter((e) => linkChecked.includes(`${e.centre}:${e.orgId}`));
    if (!chosen.length) { message.error("Pick at least one organisation"); return; }
    const orgs: OrgMapping[] = chosen.map((e) => ({ centreId: e.centre, crelioOrgId: e.orgId, label: e.name }));
    setBusy(true);
    try {
      let corpId: string; let corpName: string;
      if (linkMode === "new") {
        if (!linkName.trim()) { message.error("Corporate name is required"); setBusy(false); return; }
        const res = await createCorporate({ name: linkName.trim(), orgs });
        corpId = res.corporate.id; corpName = res.corporate.name;
      } else {
        if (!linkCorpId) { message.error("Pick a corporate"); setBusy(false); return; }
        const existing = rows.find((r) => r.id === linkCorpId)!;
        const merged = [
          ...existing.orgs.map((o) => ({ centreId: o.centre_id, crelioOrgId: o.crelio_org_id, label: o.org_label ?? undefined })),
          ...orgs.filter((o) => !existing.orgs.some((e) => e.centre_id === o.centreId && e.crelio_org_id === o.crelioOrgId)),
        ];
        await updateCorporate(linkCorpId, { orgs: merged });
        corpId = linkCorpId; corpName = existing.name;
      }
      message.success(`Linked to ${corpName}`);
      setLinkGroup(null);
      await load();
      // Straight into login creation — the usual next step after linking.
      setLoginFor({ corpId, corpName });
    } catch (e: any) { message.error(e.message); } finally { setBusy(false); }
  }

  async function submitLogin() {
    if (!loginFor) return;
    const v = await loginForm.validateFields();
    setBusy(true);
    try {
      const res = await createLogin({ kind: "corporate", email: v.email, name: v.name || undefined, corporateId: loginFor.corpId });
      setLoginFor(null); loginForm.resetFields();
      showPasswordOnce(res.email, res.password);
      load();
    } catch (e: any) { message.error(e.message); } finally { setBusy(false); }
  }

  async function submitCreate() {
    const v = await form.validateFields();
    if (!orgDraft.length) { message.error("Add at least one Crelio organization mapping"); return; }
    setBusy(true);
    try {
      const res = await createCorporate({ name: v.name, code: v.code || undefined, orgs: orgDraft });
      message.success("Corporate created");
      setCreateOpen(false); form.resetFields(); setOrgDraft([]);
      load();
      navigate(`/corporates/${res.corporate.id}`);
    } catch (e: any) { message.error(e.message); } finally { setBusy(false); }
  }

  async function submitStaff() {
    const v = await staffForm.validateFields();
    setBusy(true);
    try {
      const res = await createLogin({ kind: v.kind, email: v.email, name: v.name || undefined });
      setStaffOpen(false); staffForm.resetFields();
      showPasswordOnce(res.email, res.password);
      loadTeam();
    } catch (e: any) { message.error(e.message); } finally { setBusy(false); }
  }

  async function resetPw(u: StaffUser) {
    try { const r = await resetLoginPassword(u.id); showPasswordOnce(u.email ?? "", r.password); }
    catch (e: any) { message.error(e.message); }
  }
  async function toggle(u: StaffUser) {
    try { await toggleLogin(u.id, u.banned); message.success(u.banned ? "Enabled" : "Disabled"); loadTeam(); }
    catch (e: any) { message.error(e.message); }
  }

  return (
    <div>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>Corporates</Typography.Title>
        <Button icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Manual corporate</Button>
      </Space>

      {/* ── Organisations (live from Crelio, all centres) ─────────────────── */}
      <Card
        title="Organisations (from Crelio)"
        extra={
          <Input
            placeholder="Search organisations"
            prefix={<SearchOutlined />}
            allowClear
            style={{ width: 240 }}
            onChange={(e) => setOrgSearch(e.target.value)}
          />
        }
        style={{ marginBottom: 20 }}
        styles={{ body: { padding: 0 } }}
      >
        {failedCentres.length > 0 && (
          <Alert type="warning" showIcon banner
            message={`Couldn't load organisations for: ${failedCentres.join(", ")}. Retry by refreshing.`} />
        )}
        {liveLoading ? (
          <div style={{ display: "grid", placeItems: "center", padding: 48 }}><Spin /></div>
        ) : (
          <Table<OrgGroup>
            dataSource={orgGroups} rowKey="key" size="small"
            scroll={{ x: "max-content" }}
            pagination={{ pageSize: 25, showSizeChanger: true, showTotal: (t) => `${t} organisations` }}
            expandable={{
              rowExpandable: (g) => g.refs.length > 0,
              expandedRowRender: (g) => (
                <div style={{ padding: "4px 8px 8px 24px" }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
                    Corporates / referrers under this organisation (from bills)
                  </Typography.Text>
                  {g.refs.map((r) => (
                    <div key={r.name} style={{
                      display: "flex", justifyContent: "space-between", maxWidth: 480,
                      padding: "4px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13,
                    }}>
                      <span>{r.name}</span>
                      <Tag color="blue" style={{ margin: 0 }}>{r.n}</Tag>
                    </div>
                  ))}
                </div>
              ),
            }}
          >
            <Table.Column<OrgGroup> title="Organisation" render={(_, g) => (
              <Typography.Text strong>{g.name}</Typography.Text>
            )} />
            <Table.Column<OrgGroup> title="Centres / Crelio org #" render={(_, g) => (
              <Space wrap size={4}>
                {g.entries.map((e) => (
                  <Tag key={`${e.centre}-${e.orgId}`}>{e.centre} #{e.orgId}</Tag>
                ))}
              </Space>
            )} />
            <Table.Column<OrgGroup> title="Orders" width={110} align="center" render={(_, g) => (
              g.orders > 0 ? (
                <Tooltip title={g.lastOrderAt ? `Last order ${new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(g.lastOrderAt))}` : undefined}>
                  <Tag color="blue" style={{ margin: 0 }}>{g.orders}</Tag>
                </Tooltip>
              ) : <Typography.Text type="secondary">—</Typography.Text>
            )} />
            <Table.Column<OrgGroup> title="Portal access" width={220} render={(_, g) => (
              g.linked.length
                ? <Space wrap size={4}>{g.linked.map((l) => (
                    <Link key={l.corpId} to={`/corporates/${l.corpId}`}>
                      <Tag color="green" style={{ cursor: "pointer" }}>{l.corpName}</Tag>
                    </Link>
                  ))}</Space>
                : <Tag>not set up</Tag>
            )} />
            <Table.Column<OrgGroup> title="Actions" width={200} render={(_, g) => (
              <Space>
                {g.linked.length === 0 ? (
                  <Button size="small" type="primary" icon={<LinkOutlined />} onClick={() => openLink(g)}>
                    Link corporate
                  </Button>
                ) : (
                  <>
                    <Button size="small" icon={<UserAddOutlined />}
                      onClick={() => setLoginFor({ corpId: g.linked[0].corpId, corpName: g.linked[0].corpName })}>
                      Add login
                    </Button>
                    <Tooltip title="Link these orgs to another / additional corporate">
                      <Button size="small" icon={<LinkOutlined />} onClick={() => openLink(g)} />
                    </Tooltip>
                  </>
                )}
              </Space>
            )} />
          </Table>
        )}
      </Card>

      {/* ── Linked corporates ─────────────────────────────────────────────── */}
      <Card title="Linked corporates" style={{ marginBottom: 20 }} styles={{ body: { padding: 0 } }}>
        <Table<CorpRow>
          dataSource={rows} rowKey="id" size="small" loading={loading}
          scroll={{ x: "max-content" }} pagination={false}
          onRow={(r) => ({ onClick: () => navigate(`/corporates/${r.id}`) })}
          style={{ cursor: "pointer" }}
        >
          <Table.Column<CorpRow> title="Corporate" render={(_, r) => (
            <Space><BankOutlined style={{ color: BRAND.primary }} /><span>{r.name}</span>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>({r.code})</Typography.Text></Space>
          )} />
          <Table.Column<CorpRow> title="Org mappings" render={(_, r) => (
            r.orgs.length
              ? <Space wrap size={4}>{r.orgs.map((o) => (
                  <Tag key={`${o.centre_id}-${o.crelio_org_id}`}>{o.centre_id} #{o.crelio_org_id}</Tag>
                ))}</Space>
              : <Typography.Text type="secondary">none</Typography.Text>
          )} />
          <Table.Column<CorpRow> title="Users" width={80} align="center" render={(_, r) => r.users} />
          <Table.Column<CorpRow> title="Status" width={100}
            render={(_, r) => <Tag color={r.is_active ? "green" : "red"}>{r.is_active ? "active" : "disabled"}</Tag>} />
          <Table.Column<CorpRow> title="Actions" width={130} render={(_, r) => (
            <Button size="small" icon={<UserAddOutlined />}
              onClick={(e) => { e.stopPropagation(); setLoginFor({ corpId: r.id, corpName: r.name }); }}>
              Add login
            </Button>
          )} />
        </Table>
      </Card>

      {/* ── Team ──────────────────────────────────────────────────────────── */}
      <Card
        title="Team — staff & admin logins"
        extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setStaffOpen(true)}>Add login</Button>}
        styles={{ body: { padding: 0 } }}
      >
        <Table<StaffUser> dataSource={team} rowKey="id" size="small" loading={teamLoading}
          scroll={{ x: "max-content" }} pagination={false}>
          <Table.Column<StaffUser> title="Email" dataIndex="email" />
          <Table.Column<StaffUser> title="Role" width={100}
            render={(_, u) => <Tag color={u.role === "admin" ? "purple" : "blue"}>{u.role}</Tag>} />
          <Table.Column<StaffUser> title="Status" width={100}
            render={(_, u) => <Tag color={u.banned ? "red" : "green"}>{u.banned ? "disabled" : "active"}</Tag>} />
          <Table.Column<StaffUser> title="Actions" width={140} render={(_, u) => (
            <Space>
              <Tooltip title="Reset password"><Button size="small" icon={<KeyOutlined />} onClick={() => resetPw(u)} /></Tooltip>
              <Tooltip title={u.banned ? "Enable" : "Disable"}>
                <Button size="small" danger={!u.banned}
                  icon={u.banned ? <CheckCircleOutlined /> : <StopOutlined />} onClick={() => toggle(u)} />
              </Tooltip>
            </Space>
          )} />
        </Table>
      </Card>

      {/* Link organisation → corporate */}
      <Modal
        title={`Link "${linkGroup?.name ?? ""}"`}
        open={!!linkGroup}
        onCancel={() => setLinkGroup(null)}
        onOk={submitLink}
        okText={linkMode === "new" ? "Create & link" : "Link"}
        confirmLoading={busy}
        width={560}
      >
        <Radio.Group value={linkMode} onChange={(e) => setLinkMode(e.target.value)} style={{ marginBottom: 16 }}>
          <Radio.Button value="new">New corporate</Radio.Button>
          <Radio.Button value="existing">Existing corporate</Radio.Button>
        </Radio.Group>

        {linkMode === "new" ? (
          <Form layout="vertical">
            <Form.Item label="Corporate name" required>
              <Input value={linkName} onChange={(e) => setLinkName(e.target.value)} />
            </Form.Item>
          </Form>
        ) : (
          <Form layout="vertical">
            <Form.Item label="Corporate" required>
              <Select
                placeholder="Pick a corporate"
                value={linkCorpId}
                onChange={setLinkCorpId}
                options={rows.map((r) => ({ value: r.id, label: r.name }))}
                showSearch optionFilterProp="label"
              />
            </Form.Item>
          </Form>
        )}

        <Typography.Text strong style={{ display: "block", marginBottom: 6 }}>
          Include these organisations:
        </Typography.Text>
        <Checkbox.Group
          value={linkChecked}
          onChange={(v) => setLinkChecked(v as string[])}
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
          options={(linkGroup?.entries ?? []).map((e) => ({
            value: `${e.centre}:${e.orgId}`,
            label: `${CENTRE_NAME[e.centre] ?? e.centre} — ${e.name} (#${e.orgId})`,
          }))}
        />
        <Alert style={{ marginTop: 12 }} type="info" showIcon
          message="All bookings under the selected org IDs (past and future) become visible to this corporate's users." />
      </Modal>

      {/* Add corporate login */}
      <Modal
        title={`Add login — ${loginFor?.corpName ?? ""}`}
        open={!!loginFor}
        onCancel={() => setLoginFor(null)}
        onOk={submitLogin}
        okText="Create login"
        confirmLoading={busy}
      >
        <Form form={loginForm} layout="vertical">
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
            <Input placeholder="person@corporate.com" />
          </Form.Item>
          <Form.Item name="name" label="Name (optional)"><Input /></Form.Item>
        </Form>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
          A strong password is generated and shown once after creation.
        </Typography.Paragraph>
      </Modal>

      {/* Manual corporate (fallback) */}
      <Modal title="New corporate (manual)" open={createOpen} onCancel={() => setCreateOpen(false)}
        onOk={submitCreate} okText="Create" confirmLoading={busy} width={620}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Visit Health" />
          </Form.Item>
          <Form.Item name="code" label="Code (optional)">
            <Input placeholder="short code — auto-generated if blank" />
          </Form.Item>
          <Form.Item label="Crelio organizations (per centre)" required>
            <OrgMappingBuilder value={orgDraft} onChange={setOrgDraft} />
          </Form.Item>
        </Form>
      </Modal>

      {/* New staff/admin login */}
      <Modal title="New staff / admin login" open={staffOpen} onCancel={() => setStaffOpen(false)}
        onOk={submitStaff} okText="Create" confirmLoading={busy}>
        <Form form={staffForm} layout="vertical" initialValues={{ kind: "staff" }}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
            <Input placeholder="person@cadabams.com" />
          </Form.Item>
          <Form.Item name="name" label="Name (optional)"><Input /></Form.Item>
          <Form.Item name="kind" label="Role">
            <Select options={[
              { value: "staff", label: "Staff — ops dashboard" },
              { value: "admin", label: "Admin — ops + user management" },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
