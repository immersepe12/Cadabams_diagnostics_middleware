import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Card, Table, Tag, Button, Space, Typography, Modal, Form, Input, message, Tooltip, Popconfirm, Spin,
} from "antd";
import {
  ArrowLeftOutlined, PlusOutlined, KeyOutlined, StopOutlined, CheckCircleOutlined, EditOutlined,
} from "@ant-design/icons";
import { supabaseClient } from "../../lib/supabase";
import {
  createLogin, resetLoginPassword, toggleLogin, updateCorporate, type OrgMapping,
} from "../../lib/api";
import { OrgMappingBuilder, showPasswordOnce } from "./list";

type Corp = { id: string; name: string; code: string; is_active: boolean };
type Org = { id: string; centre_id: string; crelio_org_id: number; org_label: string | null };
type CorpUser = { user_id: string; email: string; display_name: string | null; is_active: boolean; created_at: string };

const CENTRE_NAME: Record<string, string> = {
  KYL: "Kalyan Nagar", JNR: "Jayanagar", KKP: "Kanakapura", BSK: "Banashankari",
};

export function CorporateShow() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [corp, setCorp] = useState<Corp | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [users, setUsers] = useState<CorpUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [orgsOpen, setOrgsOpen] = useState(false);
  const [orgDraft, setOrgDraft] = useState<OrgMapping[]>([]);
  const [userForm] = Form.useForm();

  async function load() {
    if (!id) return;
    setLoading(true);
    const [{ data: c }, { data: o }, { data: u }] = await Promise.all([
      supabaseClient.from("corporates").select("id, name, code, is_active").eq("id", id).maybeSingle(),
      supabaseClient.from("corporate_orgs").select("id, centre_id, crelio_org_id, org_label").eq("corporate_id", id).order("centre_id"),
      supabaseClient.from("corporate_users").select("user_id, email, display_name, is_active, created_at").eq("corporate_id", id).order("created_at"),
    ]);
    setCorp((c as Corp) ?? null);
    setOrgs((o as Org[]) ?? []);
    setUsers((u as CorpUser[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addUser() {
    const v = await userForm.validateFields();
    setBusy(true);
    try {
      const res = await createLogin({ kind: "corporate", email: v.email, name: v.name || undefined, corporateId: id });
      setUserOpen(false); userForm.resetFields();
      showPasswordOnce(res.email, res.password);
      load();
    } catch (e: any) { message.error(e.message); } finally { setBusy(false); }
  }

  async function resetPw(u: CorpUser) {
    try { const r = await resetLoginPassword(u.user_id); showPasswordOnce(u.email, r.password); }
    catch (e: any) { message.error(e.message); }
  }
  async function toggleUser(u: CorpUser) {
    try { await toggleLogin(u.user_id, !u.is_active); message.success(u.is_active ? "User disabled" : "User enabled"); load(); }
    catch (e: any) { message.error(e.message); }
  }
  async function toggleCorp() {
    if (!corp) return;
    try { await updateCorporate(corp.id, { isActive: !corp.is_active }); load(); }
    catch (e: any) { message.error(e.message); }
  }
  async function saveOrgs() {
    setBusy(true);
    try {
      await updateCorporate(id!, { orgs: orgDraft });
      message.success("Organizations updated");
      setOrgsOpen(false); load();
    } catch (e: any) { message.error(e.message); } finally { setBusy(false); }
  }

  if (loading) return <div style={{ display: "grid", placeItems: "center", height: "50vh" }}><Spin /></div>;
  if (!corp) return <Typography.Text type="secondary">Corporate not found.</Typography.Text>;

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/corporates")} />
        <Typography.Title level={4} style={{ margin: 0 }}>{corp.name}</Typography.Title>
        <Tag color={corp.is_active ? "green" : "red"}>{corp.is_active ? "active" : "disabled"}</Tag>
        <Popconfirm title={`${corp.is_active ? "Disable" : "Enable"} this corporate?`} onConfirm={toggleCorp}>
          <Button size="small" danger={corp.is_active}>{corp.is_active ? "Disable" : "Enable"}</Button>
        </Popconfirm>
      </Space>

      <Card
        title="Crelio organizations"
        extra={<Button size="small" icon={<EditOutlined />} onClick={() => {
          setOrgDraft(orgs.map((o) => ({ centreId: o.centre_id, crelioOrgId: o.crelio_org_id, label: o.org_label ?? undefined })));
          setOrgsOpen(true);
        }}>Edit</Button>}
        style={{ marginBottom: 16 }} styles={{ body: { padding: 0 } }}
      >
        <Table<Org> dataSource={orgs} rowKey="id" size="small" pagination={false} scroll={{ x: "max-content" }}>
          <Table.Column<Org> title="Centre" width={160} render={(_, o) => CENTRE_NAME[o.centre_id] ?? o.centre_id} />
          <Table.Column<Org> title="Organization" render={(_, o) => o.org_label ?? "—"} />
          <Table.Column<Org> title="Crelio org #" width={130} render={(_, o) => <code>{o.crelio_org_id}</code>} />
        </Table>
      </Card>

      <Card
        title="Portal users"
        extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setUserOpen(true)}>Add user</Button>}
        styles={{ body: { padding: 0 } }}
      >
        <Table<CorpUser> dataSource={users} rowKey="user_id" size="small" pagination={false} scroll={{ x: "max-content" }}>
          <Table.Column<CorpUser> title="User" render={(_, u) => (
            <Space direction="vertical" size={0}>
              <span>{u.display_name ?? u.email}</span>
              {u.display_name && <Typography.Text type="secondary" style={{ fontSize: 11 }}>{u.email}</Typography.Text>}
            </Space>
          )} />
          <Table.Column<CorpUser> title="Status" width={100}
            render={(_, u) => <Tag color={u.is_active ? "green" : "red"}>{u.is_active ? "active" : "disabled"}</Tag>} />
          <Table.Column<CorpUser> title="Actions" width={140} render={(_, u) => (
            <Space>
              <Tooltip title="Reset password"><Button size="small" icon={<KeyOutlined />} onClick={() => resetPw(u)} /></Tooltip>
              <Tooltip title={u.is_active ? "Disable" : "Enable"}>
                <Button size="small" danger={u.is_active}
                  icon={u.is_active ? <StopOutlined /> : <CheckCircleOutlined />} onClick={() => toggleUser(u)} />
              </Tooltip>
            </Space>
          )} />
        </Table>
      </Card>

      <Modal title="Add portal user" open={userOpen} onCancel={() => setUserOpen(false)}
        onOk={addUser} okText="Create login" confirmLoading={busy}>
        <Form form={userForm} layout="vertical">
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
            <Input placeholder="person@corporate.com" />
          </Form.Item>
          <Form.Item name="name" label="Name (optional)"><Input /></Form.Item>
        </Form>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
          A strong password is generated and shown once after creation.
        </Typography.Paragraph>
      </Modal>

      <Modal title="Edit Crelio organizations" open={orgsOpen} onCancel={() => setOrgsOpen(false)}
        onOk={saveOrgs} okText="Save" confirmLoading={busy} width={620}>
        <OrgMappingBuilder value={orgDraft} onChange={setOrgDraft} />
      </Modal>
    </div>
  );
}
