import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Table, Tag, Button, Space, Typography, Modal, Form, Input, Select, message, Tooltip, Alert,
} from "antd";
import { PlusOutlined, BankOutlined, KeyOutlined, StopOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { supabaseClient } from "../../lib/supabase";
import {
  createCorporate, createLogin, listStaffUsers, resetLoginPassword, toggleLogin,
  fetchOrganizations, type CrelioOrg, type OrgMapping, type StaffUser,
} from "../../lib/api";

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
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [orgDraft, setOrgDraft] = useState<OrgMapping[]>([]);
  const [staffOpen, setStaffOpen] = useState(false);
  const [form] = Form.useForm();
  const [staffForm] = Form.useForm();

  async function load() {
    setLoading(true);
    const [{ data: corps }, { data: orgs }, { data: users }] = await Promise.all([
      supabaseClient.from("corporates").select("id, name, code, is_active").order("name"),
      supabaseClient.from("corporate_orgs").select("corporate_id, centre_id, crelio_org_id, org_label"),
      supabaseClient.from("corporate_users").select("corporate_id"),
    ]);
    const byCorp = new Map<string, CorpRow>();
    for (const c of corps ?? []) byCorp.set(c.id, { ...(c as any), orgs: [], users: 0 });
    for (const o of orgs ?? []) byCorp.get((o as any).corporate_id)?.orgs.push(o as any);
    for (const u of users ?? []) { const r = byCorp.get((u as any).corporate_id); if (r) r.users++; }
    setRows([...byCorp.values()]);
    setLoading(false);
  }
  async function loadTeam() {
    setTeamLoading(true);
    try { setTeam(await listStaffUsers()); } catch (e: any) { message.error(e.message); }
    setTeamLoading(false);
  }
  useEffect(() => { load(); loadTeam(); }, []);

  async function submitCreate() {
    const v = await form.validateFields();
    if (!orgDraft.length) { message.error("Add at least one Crelio organization mapping"); return; }
    setCreating(true);
    try {
      const res = await createCorporate({ name: v.name, code: v.code || undefined, orgs: orgDraft });
      message.success("Corporate created");
      setCreateOpen(false); form.resetFields(); setOrgDraft([]);
      load();
      navigate(`/corporates/${res.corporate.id}`);
    } catch (e: any) { message.error(e.message); } finally { setCreating(false); }
  }

  async function submitStaff() {
    const v = await staffForm.validateFields();
    setCreating(true);
    try {
      const res = await createLogin({ kind: v.kind, email: v.email, name: v.name || undefined });
      setStaffOpen(false); staffForm.resetFields();
      showPasswordOnce(res.email, res.password);
      loadTeam();
    } catch (e: any) { message.error(e.message); } finally { setCreating(false); }
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
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>New Corporate</Button>
      </Space>

      <Card style={{ marginBottom: 20 }} styles={{ body: { padding: 0 } }}>
        <Table<CorpRow>
          dataSource={rows} rowKey="id" size="small" loading={loading}
          scroll={{ x: "max-content" }} pagination={false}
          onRow={(r) => ({ onClick: () => navigate(`/corporates/${r.id}`) })}
          style={{ cursor: "pointer" }}
        >
          <Table.Column<CorpRow> title="Corporate" render={(_, r) => (
            <Space><BankOutlined style={{ color: "#0F766E" }} /><span>{r.name}</span>
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
        </Table>
      </Card>

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

      {/* New corporate */}
      <Modal title="New corporate" open={createOpen} onCancel={() => setCreateOpen(false)}
        onOk={submitCreate} okText="Create" confirmLoading={creating} width={620}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Visit Health" />
          </Form.Item>
          <Form.Item name="code" label="Code (optional)">
            <Input placeholder="short code — auto-generated if blank" />
          </Form.Item>
          <Form.Item label="Crelio organizations (per centre)" required
            tooltip="Which Crelio orgs' bookings belong to this corporate. A corporate can have one or more per centre.">
            <OrgMappingBuilder value={orgDraft} onChange={setOrgDraft} />
          </Form.Item>
          <Alert type="info" showIcon message="Bookings under these org IDs (past and future) become visible to this corporate's users." />
        </Form>
      </Modal>

      {/* New staff/admin login */}
      <Modal title="New staff / admin login" open={staffOpen} onCancel={() => setStaffOpen(false)}
        onOk={submitStaff} okText="Create" confirmLoading={creating}>
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
