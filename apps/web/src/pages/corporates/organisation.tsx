import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Card, Table, Tag, Button, Space, Typography, Modal, Form, Input, Radio, Select, Checkbox, Spin, Empty, message, Statistic, Row, Col,
} from "antd";
import { ArrowLeftOutlined, LinkOutlined, UserAddOutlined, BankOutlined } from "@ant-design/icons";
import { supabaseClient } from "../../lib/supabase";
import {
  fetchOrganizations, createCorporate, updateCorporate, createLogin, type OrgMapping,
} from "../../lib/api";
import { showPasswordOnce } from "./list";
import { BRAND } from "../../theme";

const CENTRES = [
  { value: "KYL", label: "Kalyan Nagar" },
  { value: "JNR", label: "Jayanagar" },
  { value: "KKP", label: "Kanakapura" },
  { value: "BSK", label: "Banashankari" },
];
const CENTRE_NAME = Object.fromEntries(CENTRES.map((c) => [c.value, c.label]));
const cleanRef = (s: string) => s.replace(/^Dr\.?\s*/i, "").replace(/^C\/O\s*/i, "").trim();

const STATUS_COLOR: Record<string, string> = {
  booked: "blue", collected: "orange", accessioned: "gold",
  report_generated: "cyan", completed: "geekblue", report_sent: "green",
  cancelled: "red", rejected: "red",
};
const STATUS_ORDER = ["booked", "collected", "accessioned", "report_generated", "completed", "report_sent"];
function aggStatus(items: { status: string }[]): string {
  const active = items.filter((i) => !["cancelled", "rejected"].includes(i.status));
  const pool = active.length ? active : items;
  if (!pool.length) return "booked";
  const idx = Math.min(...pool.map((i) => Math.max(0, STATUS_ORDER.indexOf(i.status))));
  return STATUS_ORDER[idx] ?? pool[0].status;
}
function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(v));
}

type Entry = { centre: string; orgId: number };
type Count = { name: string; n: number };
type OrderRow = {
  id: string; order_number: string; patient_name: string | null; centre_id: string;
  created_at: string; referral_name: string | null; order_items: { status: string }[];
};

export function OrganisationShow() {
  const { name = "" } = useParams<{ name: string }>();
  const orgName = decodeURIComponent(name);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [linked, setLinked] = useState<{ corpId: string; corpName: string }[]>([]);
  const [corporates, setCorporates] = useState<{ id: string; name: string; orgs: OrgMapping[] }[]>([]);
  const [refs, setRefs] = useState<Count[]>([]);
  const [tests, setTests] = useState<Count[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [busy, setBusy] = useState(false);

  // Link + login modals (single-organisation versions of the directory's flows)
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkMode, setLinkMode] = useState<"new" | "existing">("new");
  const [linkName, setLinkName] = useState("");
  const [linkCorpId, setLinkCorpId] = useState<string>();
  const [linkChecked, setLinkChecked] = useState<string[]>([]);
  const [loginFor, setLoginFor] = useState<{ corpId: string; corpName: string } | null>(null);
  const [loginForm] = Form.useForm();

  async function load() {
    setLoading(true);
    const key = orgName.trim().toUpperCase();

    // Resolve this organisation's org ids across centres (live Crelio).
    const results = await Promise.allSettled(
      CENTRES.map(async (c) => (await fetchOrganizations(c.value))
        .filter((o) => o.name.trim().toUpperCase() === key)
        .map((o) => ({ centre: c.value, orgId: o.orgId }))),
    );
    const found: Entry[] = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    setEntries(found.sort((a, b) => a.centre.localeCompare(b.centre)));
    const ids = found.map((e) => e.orgId);

    const [{ data: corps }, { data: corgs }] = await Promise.all([
      supabaseClient.from("corporates").select("id, name"),
      supabaseClient.from("corporate_orgs").select("corporate_id, centre_id, crelio_org_id, org_label"),
    ]);
    const corpList = (corps ?? []).map((c: any) => ({
      id: c.id as string, name: c.name as string,
      orgs: ((corgs ?? []) as any[]).filter((o) => o.corporate_id === c.id)
        .map((o) => ({ centreId: o.centre_id as string, crelioOrgId: o.crelio_org_id as number, label: (o.org_label as string) ?? undefined })),
    }));
    setCorporates(corpList);
    const linkedSet = new Map<string, string>();
    for (const c of corpList) for (const o of c.orgs) {
      if (ids.includes(o.crelioOrgId)) linkedSet.set(c.id, c.name);
    }
    setLinked([...linkedSet.entries()].map(([corpId, corpName]) => ({ corpId, corpName })));

    if (ids.length) {
      const [{ data: refRows }, { data: testRows }, { data: orderRows, count }] = await Promise.all([
        supabaseClient.from("org_referrals").select("referral_name, order_count").in("crelio_org_id", ids),
        supabaseClient.from("org_tests").select("test_name, order_count").in("crelio_org_id", ids),
        supabaseClient.from("orders")
          .select("id, order_number, patient_name, centre_id, created_at, referral_name, order_items(status)", { count: "exact" })
          .in("crelio_org_id", ids)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);
      const agg = (rows: any[], key: string) => {
        const m = new Map<string, Count>();
        for (const r of rows ?? []) {
          const nm = key === "referral_name" ? (cleanRef(String(r[key])) || String(r[key])) : String(r[key]);
          const a = m.get(nm.toUpperCase());
          if (a) a.n += r.order_count;
          else m.set(nm.toUpperCase(), { name: nm, n: r.order_count });
        }
        return [...m.values()].sort((a, b) => b.n - a.n);
      };
      setRefs(agg(refRows ?? [], "referral_name"));
      setTests(agg(testRows ?? [], "test_name"));
      setOrders((orderRows as OrderRow[]) ?? []);
      setTotalOrders(count ?? 0);
    } else {
      setRefs([]); setTests([]); setOrders([]); setTotalOrders(0);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [orgName]); // eslint-disable-line react-hooks/exhaustive-deps

  function openLink() {
    setLinkMode("new");
    setLinkName(orgName);
    setLinkCorpId(undefined);
    setLinkChecked(entries.map((e) => `${e.centre}:${e.orgId}`));
    setLinkOpen(true);
  }

  async function submitLink() {
    const chosen = entries.filter((e) => linkChecked.includes(`${e.centre}:${e.orgId}`));
    if (!chosen.length) { message.error("Pick at least one organisation entry"); return; }
    const orgs: OrgMapping[] = chosen.map((e) => ({ centreId: e.centre, crelioOrgId: e.orgId, label: orgName }));
    setBusy(true);
    try {
      let corpId: string; let corpName: string;
      if (linkMode === "new") {
        if (!linkName.trim()) { message.error("Corporate name is required"); setBusy(false); return; }
        const res = await createCorporate({ name: linkName.trim(), orgs });
        corpId = res.corporate.id; corpName = res.corporate.name;
      } else {
        if (!linkCorpId) { message.error("Pick a corporate"); setBusy(false); return; }
        const existing = corporates.find((c) => c.id === linkCorpId)!;
        const merged = [
          ...existing.orgs,
          ...orgs.filter((o) => !existing.orgs.some((e) => e.centreId === o.centreId && e.crelioOrgId === o.crelioOrgId)),
        ];
        await updateCorporate(linkCorpId, { orgs: merged });
        corpId = linkCorpId; corpName = existing.name;
      }
      message.success(`Linked to ${corpName}`);
      setLinkOpen(false);
      await load();
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
    } catch (e: any) { message.error(e.message); } finally { setBusy(false); }
  }

  if (loading) return <div style={{ display: "grid", placeItems: "center", height: "50vh" }}><Spin size="large" /></div>;

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/corporates")} />
        <BankOutlined style={{ color: BRAND.primary, fontSize: 18 }} />
        <Typography.Title level={4} style={{ margin: 0 }}>{orgName}</Typography.Title>
        {linked.length
          ? linked.map((l) => (
              <Link key={l.corpId} to={`/corporates/${l.corpId}`}>
                <Tag color="green" style={{ cursor: "pointer" }}>{l.corpName}</Tag>
              </Link>
            ))
          : <Tag>portal not set up</Tag>}
      </Space>

      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 18 } }}>
        <Row gutter={[16, 12]} align="middle">
          <Col xs={12} sm={6}><Statistic title="Total orders" value={totalOrders} /></Col>
          <Col xs={12} sm={6}><Statistic title="Centres" value={entries.length} /></Col>
          <Col xs={24} sm={12}>
            <Space wrap size={4}>
              {entries.map((e) => (
                <Tag key={`${e.centre}-${e.orgId}`}>{CENTRE_NAME[e.centre] ?? e.centre} #{e.orgId}</Tag>
              ))}
            </Space>
          </Col>
        </Row>
        <Space style={{ marginTop: 14 }} wrap>
          {linked.length === 0 ? (
            <Button type="primary" icon={<LinkOutlined />} onClick={openLink}>Link corporate</Button>
          ) : (
            <>
              <Button type="primary" icon={<UserAddOutlined />}
                onClick={() => setLoginFor({ corpId: linked[0].corpId, corpName: linked[0].corpName })}>
                Add login
              </Button>
              <Button icon={<LinkOutlined />} onClick={openLink}>Link to another corporate</Button>
            </>
          )}
        </Space>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={10}>
          <Card title={`Corporates / referrers (${refs.length})`} styles={{ body: { padding: refs.length ? "8px 16px" : 24 } }}>
            {refs.length ? refs.map((r) => (
              <div key={r.name} style={{
                display: "flex", justifyContent: "space-between", gap: 8,
                padding: "6px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13,
              }}>
                <span>{r.name}</span>
                <Tag color="blue" style={{ margin: 0 }}>{r.n}</Tag>
              </div>
            )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No referrer data yet" />}
          </Card>
        </Col>
        <Col xs={24} md={14}>
          <Card title={`Tests & packages ordered (${tests.length})`} styles={{ body: { padding: tests.length ? "8px 16px" : 24, maxHeight: 420, overflowY: "auto" } }}>
            {tests.length ? tests.map((t) => (
              <div key={t.name} style={{
                display: "flex", justifyContent: "space-between", gap: 8,
                padding: "6px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13,
              }}>
                <span>{t.name}</span>
                <Tag style={{ margin: 0, background: BRAND.primarySoft, color: BRAND.primary, border: "none" }}>{t.n}</Tag>
              </div>
            )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No orders yet" />}
          </Card>
        </Col>
      </Row>

      <Card title={`Recent orders (${orders.length} of ${totalOrders})`} styles={{ body: { padding: 0 } }}>
        <Table<OrderRow>
          dataSource={orders} rowKey="id" size="small" pagination={false}
          scroll={{ x: "max-content" }}
          onRow={(r) => ({ onClick: () => navigate(`/bills/${r.id}`) })}
          style={{ cursor: "pointer" }}
        >
          <Table.Column<OrderRow> title="Order #" width={150}
            render={(_, r) => <code style={{ fontSize: 12 }}>{r.order_number}</code>} />
          <Table.Column<OrderRow> title="Patient" render={(_, r) => r.patient_name ?? "—"} />
          <Table.Column<OrderRow> title="Referrer" render={(_, r) => r.referral_name ? cleanRef(r.referral_name) : "—"} />
          <Table.Column<OrderRow> title="Centre" width={130} render={(_, r) => CENTRE_NAME[r.centre_id] ?? r.centre_id} />
          <Table.Column<OrderRow> title="Status" width={140} render={(_, r) => {
            const s = aggStatus(r.order_items ?? []);
            return <Tag color={STATUS_COLOR[s] ?? "default"}>{s.replace(/_/g, " ")}</Tag>;
          }} />
          <Table.Column<OrderRow> title="Date" width={160} render={(_, r) => fmtDate(r.created_at)} />
        </Table>
      </Card>

      {/* Link modal (this organisation only) */}
      <Modal
        title={`Link "${orgName}"`}
        open={linkOpen}
        onCancel={() => setLinkOpen(false)}
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
              <Select placeholder="Pick a corporate" value={linkCorpId} onChange={setLinkCorpId}
                options={corporates.map((c) => ({ value: c.id, label: c.name }))}
                showSearch optionFilterProp="label" />
            </Form.Item>
          </Form>
        )}
        <Typography.Text strong style={{ display: "block", marginBottom: 6 }}>Include these organisations:</Typography.Text>
        <Checkbox.Group
          value={linkChecked}
          onChange={(v) => setLinkChecked(v as string[])}
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
          options={entries.map((e) => ({
            value: `${e.centre}:${e.orgId}`,
            label: `${CENTRE_NAME[e.centre] ?? e.centre} — #${e.orgId}`,
          }))}
        />
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
    </div>
  );
}
