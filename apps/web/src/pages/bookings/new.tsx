import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Form, Input, InputNumber, Select, Radio, DatePicker, Button, Space,
  Typography, message, Divider, Row, Col, Alert, Table,
} from "antd";
import { ArrowLeftOutlined, UserOutlined, DeleteOutlined } from "@ant-design/icons";
import { supabaseClient } from "../../lib/supabase";
import { createBooking, fetchOrganizations, type BookingPayload, type CrelioOrg } from "../../lib/api";

const CENTRES = [
  { value: "KYL", label: "Kalyan Nagar" },
  { value: "JNR", label: "Jayanagar" },
  { value: "KKP", label: "Kanakapura" },
  { value: "BSK", label: "Banashankari" },
];

type TestOpt = { value: string; label: string };

const CREATE_NEW = "__create_new__";

type CatalogueRow = { crelio_test_id: string; test_name: string; price?: number | null };
type LineItem = { crelioTestId: string; testName: string; price: number };

export function BookingNew() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [catalogue, setCatalogue] = useState<CatalogueRow[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loadingTests, setLoadingTests] = useState(false);
  const [orgs, setOrgs] = useState<CrelioOrg[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);

  // Existing-patient search (over our mirror). Picking one reuses the Crelio
  // patient; leaving it blank means the entered details create a new patient.
  type PatientRow = {
    patient_mobile: string; patient_name: string | null;
    patient_age: number | null; patient_gender: string | null;
    crelio_patient_id: string | null;
  };
  const [patientResults, setPatientResults] = useState<PatientRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [linked, setLinked] = useState<{ mobile: string; name: string | null; crelioPatientId: string | null } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function searchPatients(q: string) {
    setSearchText(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q || q.trim().length < 2) { setPatientResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabaseClient
        .from("orders")
        .select("patient_mobile, patient_name, patient_age, patient_gender, crelio_patient_id, created_at")
        .or(`patient_mobile.ilike.%${q}%,patient_name.ilike.%${q}%`)
        .not("patient_mobile", "is", null)
        .order("created_at", { ascending: false })
        .limit(30);
      const seen = new Set<string>();
      const uniq = (data ?? []).filter((r: any) => {
        if (!r.patient_mobile || seen.has(r.patient_mobile)) return false;
        seen.add(r.patient_mobile); return true;
      }) as PatientRow[];
      setPatientResults(uniq);
      setSearching(false);
    }, 300);
  }

  // Reset the search and drop focus so the dropdown closes after a selection.
  function closeSearch() {
    setSearchText("");
    setTimeout(() => (document.getElementById("patient-search") as HTMLElement | null)?.blur(), 0);
  }

  function pickPatient(mobile: string) {
    const r = patientResults.find((x) => x.patient_mobile === mobile);
    if (!r) return;
    form.setFieldsValue({
      name: r.patient_name ?? undefined,
      mobile: r.patient_mobile,
      age: r.patient_age ?? undefined,
      gender: r.patient_gender ?? "M",
    });
    setLinked({ mobile: r.patient_mobile, name: r.patient_name, crelioPatientId: r.crelio_patient_id });
    closeSearch();
  }

  // "Create new" from the search box: drop any link, seed the mobile from what
  // was typed (if it's a number), and let ops fill the rest as a new patient.
  function createNewFromSearch() {
    const digits = searchText.replace(/\D/g, "");
    setLinked(null);
    if (digits.length >= 6) form.setFieldsValue({ mobile: digits });
    form.setFieldsValue({ name: undefined, age: undefined });
    setPatientResults([]); closeSearch();
    message.info("New patient — enter the details below.");
  }

  const centre = Form.useWatch("centreId", form);
  const channel = Form.useWatch("channel", form);
  const mode = Form.useWatch("mode", form);

  // Load corporate orgs when a corporate booking at a centre is selected
  useEffect(() => {
    if (channel !== "corporate" || !centre) { setOrgs([]); return; }
    setLoadingOrgs(true);
    fetchOrganizations(centre)
      .then((o) => setOrgs(o))
      .catch(() => setOrgs([]))
      .finally(() => setLoadingOrgs(false));
  }, [channel, centre]);

  // Load this centre's catalogue (with prices) for the line-item picker.
  // select("*") is resilient if the price column isn't present yet.
  const priceMap = useMemo(
    () => new Map(catalogue.map((t) => [t.crelio_test_id, { name: t.test_name, price: Number(t.price ?? 0) || 0 }])),
    [catalogue],
  );
  const testOpts = useMemo<TestOpt[]>(
    () => catalogue.map((t) => ({
      value: t.crelio_test_id,
      label: t.price ? `${t.test_name} — ₹${Number(t.price)}` : t.test_name,
    })),
    [catalogue],
  );

  useEffect(() => {
    if (!centre) { setCatalogue([]); return; }
    setLoadingTests(true);
    supabaseClient
      .from("catalogue_tests")
      .select("*")
      .eq("centre_id", centre)
      .order("test_name")
      .limit(5000)
      .then(({ data }) => {
        setCatalogue((data ?? []) as CatalogueRow[]);
        setLoadingTests(false);
        setLineItems([]);
      });
  }, [centre]);

  function addLineItem(id: string) {
    if (lineItems.some((li) => li.crelioTestId === id)) return;
    const t = priceMap.get(id);
    if (!t) return;
    setLineItems((prev) => [...prev, { crelioTestId: id, testName: t.name, price: t.price }]);
  }
  function updatePrice(id: string, price: number) {
    setLineItems((prev) => prev.map((li) => (li.crelioTestId === id ? { ...li, price } : li)));
  }
  function removeLineItem(id: string) {
    setLineItems((prev) => prev.filter((li) => li.crelioTestId !== id));
  }
  const total = lineItems.reduce((s, li) => s + (Number(li.price) || 0), 0);

  async function onFinish(v: any) {
    if (!lineItems.length) { message.error("Add at least one test"); return; }
    const payload: BookingPayload = {
      centreId: v.centreId,
      channel: v.channel,
      organizationIdLH: v.organizationIdLH || undefined,
      patient: {
        name: v.name,
        mobile: v.mobile || undefined,
        age: Number(v.age),
        gender: v.gender,
        email: v.email || undefined,
        city: v.city || undefined,
        dob: v.dob ? v.dob.format("YYYY-MM-DD") : undefined,
        // Reuse the Crelio patient only if the linked mobile still matches.
        labPatientId: linked && v.mobile === linked.mobile ? (linked.crelioPatientId || undefined) : undefined,
      },
      tests: lineItems.map((li) => ({ crelioTestId: li.crelioTestId, testName: li.testName, price: li.price })),
      payment: {
        totalAmount: total,
        advance: v.advance ? Number(v.advance) : undefined,
        paymentType: v.paymentType,
      },
      referralName: v.referralName || undefined,
      comments: v.comments || undefined,
      ...(v.mode === "appointment" && v.apptRange
        ? { appointment: { startDate: v.apptRange[0].toISOString(), endDate: v.apptRange[1].toISOString() } }
        : {}),
      ...(v.mode === "home"
        ? { homeCollection: { dateTime: v.hcDateTime?.toISOString(), address: v.hcAddress, location: v.hcLocation || undefined } }
        : {}),
    };

    setSubmitting(true);
    try {
      const res = await createBooking(payload);
      message.success(`Bill created — Crelio #${res.crelioBillId || "pending"}`);
      navigate(`/bills/${res.orderId}`);
    } catch (err: any) {
      message.error(err?.message ?? "Booking failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: "0 16px 40px", maxWidth: 820 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/bills")} />
        <Typography.Title level={4} style={{ margin: 0 }}>New Booking</Typography.Title>
      </Space>

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ channel: "d2c", gender: "M", paymentType: "Cash", mode: "normal" }}
      >
        <Card title="Centre & Channel" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12}>
              <Form.Item name="centreId" label="Centre" rules={[{ required: true }]}>
                <Select options={CENTRES} placeholder="Select centre" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="channel" label="Channel">
                <Radio.Group>
                  <Radio.Button value="d2c">D2C</Radio.Button>
                  <Radio.Button value="corporate">Corporate</Radio.Button>
                  <Radio.Button value="walkin">Walk-in</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>
          {channel === "corporate" && (
            <Form.Item name="organizationIdLH" label="Corporate organization" extra="Applies the corporate rate list; bill goes to CREDIT." rules={[{ required: true, message: "Pick the corporate organization" }]}>
              <Select
                showSearch
                loading={loadingOrgs}
                disabled={!centre}
                placeholder={centre ? "Search organizations…" : "Select a centre first"}
                optionFilterProp="label"
                style={{ width: "100%", maxWidth: 420 }}
                options={orgs.map((o) => ({ value: o.orgId, label: o.code ? `${o.name} (${o.code})` : o.name }))}
                notFoundContent={loadingOrgs ? "Loading…" : "No organizations"}
              />
            </Form.Item>
          )}
        </Card>

        <Card title="Patient" size="small" style={{ marginBottom: 16 }}>
          <Form.Item label="Find existing patient" tooltip="Search mirrored patients by name or mobile. Pick one to reuse them, or enter a new number and click “Create new patient”.">
            <Select
              id="patient-search"
              showSearch
              filterOption={false}
              searchValue={searchText}
              onSearch={searchPatients}
              value={undefined}
              loading={searching}
              suffixIcon={<UserOutlined />}
              placeholder="Search by name or mobile…"
              notFoundContent={searching ? "Searching…" : "Type a name or number"}
              // "Create new" is a real option (not a dropdown footer): selecting it
              // closes the dropdown natively, and its presence keeps the dropdown
              // from auto-closing on empty results — so no flash, no focus hacks.
              onChange={(val) => (val === CREATE_NEW ? createNewFromSearch() : pickPatient(String(val)))}
              options={[
                ...patientResults.map((r) => ({
                  value: r.patient_mobile,
                  label: `${r.patient_name ?? "No name"} · ${r.patient_mobile}`,
                })),
                ...(searchText.trim().length >= 2
                  ? [{
                      value: CREATE_NEW,
                      label: `➕ Create new patient${/\d{3,}/.test(searchText) ? `: ${searchText.replace(/\D/g, "")}` : ""}`,
                    }]
                  : []),
              ]}
            />
          </Form.Item>
          {linked && (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Reusing existing patient: ${linked.name ?? linked.mobile}${linked.crelioPatientId ? ` (Crelio #${linked.crelioPatientId})` : ""}`}
              action={<Button size="small" onClick={() => setLinked(null)}>Use as new patient</Button>}
            />
          )}
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12}><Form.Item name="name" label="Full name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="mobile" label="Mobile"><Input /></Form.Item></Col>
            <Col xs={12} sm={6}><Form.Item name="age" label="Age" rules={[{ required: true }]}><InputNumber style={{ width: "100%" }} min={0} max={130} /></Form.Item></Col>
            <Col xs={12} sm={6}>
              <Form.Item name="gender" label="Gender">
                <Radio.Group><Radio.Button value="M">M</Radio.Button><Radio.Button value="F">F</Radio.Button><Radio.Button value="O">O</Radio.Button></Radio.Group>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}><Form.Item name="dob" label="DOB (optional)"><DatePicker style={{ width: "100%" }} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="email" label="Email (optional)"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="city" label="City (optional)"><Input /></Form.Item></Col>
          </Row>
        </Card>

        <Card title="Tests" size="small" style={{ marginBottom: 16 }}>
          <Select
            showSearch
            value={null}
            loading={loadingTests}
            disabled={!centre}
            placeholder={centre ? "Add a test / profile — price fills in automatically…" : "Select a centre first"}
            options={testOpts}
            optionFilterProp="label"
            onChange={(id) => addLineItem(String(id))}
            style={{ width: "100%", marginBottom: 12 }}
          />
          {lineItems.length > 0 ? (
            <Table<LineItem>
              dataSource={lineItems}
              rowKey="crelioTestId"
              size="small"
              scroll={{ x: "max-content" }}
              pagination={false}
              columns={[
                { title: "Test / Profile", dataIndex: "testName" },
                {
                  title: "Price (₹)", width: 150, align: "right",
                  render: (_, li) => (
                    <InputNumber
                      min={0}
                      value={li.price}
                      onChange={(val) => updatePrice(li.crelioTestId, Number(val) || 0)}
                      style={{ width: 120 }}
                    />
                  ),
                },
                {
                  title: "", width: 44,
                  render: (_, li) => (
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeLineItem(li.crelioTestId)} />
                  ),
                },
              ]}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}><strong>Total</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right"><strong>₹{total.toLocaleString("en-IN")}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} />
                </Table.Summary.Row>
              )}
            />
          ) : (
            <Typography.Text type="secondary">No tests added yet.</Typography.Text>
          )}
        </Card>

        <Card title="Payment" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 8]} align="bottom">
            <Col xs={24} sm={8}>
              <Form.Item name="paymentType" label="Payment type">
                <Select options={[{ value: "Cash", label: "Cash" }, { value: "Online", label: "Online" }, { value: "Credit", label: "Credit" }]} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}><Form.Item name="advance" label="Advance (optional)"><InputNumber style={{ width: "100%" }} min={0} max={total || undefined} prefix="₹" /></Form.Item></Col>
            <Col xs={12} sm={8}>
              <Form.Item label="Bill total">
                <Typography.Title level={4} style={{ margin: 0 }}>₹{total.toLocaleString("en-IN")}</Typography.Title>
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card title="Booking type" size="small" style={{ marginBottom: 16 }}>
          <Form.Item name="mode">
            <Radio.Group>
              <Radio.Button value="normal">Walk-in / Normal</Radio.Button>
              <Radio.Button value="appointment">Appointment</Radio.Button>
              <Radio.Button value="home">Home Collection</Radio.Button>
            </Radio.Group>
          </Form.Item>
          {mode === "appointment" && (
            <Form.Item name="apptRange" label="Appointment window" rules={[{ required: true }]}>
              <DatePicker.RangePicker showTime style={{ width: "100%" }} />
            </Form.Item>
          )}
          {mode === "home" && (
            <>
              <Form.Item name="hcDateTime" label="Collection date & time" rules={[{ required: true }]}>
                <DatePicker showTime style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="hcAddress" label="Address" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
              <Form.Item name="hcLocation" label="Geo location (lat,long — optional)"><Input placeholder="22.6001, 88.4112" /></Form.Item>
            </>
          )}
        </Card>

        <Divider />
        <Space>
          <Button type="primary" htmlType="submit" loading={submitting}>Create Bill in Crelio</Button>
          <Button onClick={() => navigate("/bills")}>Cancel</Button>
        </Space>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12 }}>
          This creates a real bill in Crelio for the selected centre.
        </Typography.Paragraph>
      </Form>
    </div>
  );
}
