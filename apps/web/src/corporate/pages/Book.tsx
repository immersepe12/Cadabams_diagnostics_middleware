import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Form, Input, InputNumber, Select, Radio, DatePicker, Button, Typography, Alert, message, Row, Col,
} from "antd";
import { supabaseClient } from "../../lib/supabase";
import { getMyOrgs, corporateBook, type CorpOrg } from "../lib/corporateApi";

const CENTRE: Record<string, string> = {
  KYL: "Kalyan Nagar", JNR: "Jayanagar", KKP: "Kanakapura", BSK: "Banashankari",
};

// Corporate self-serve booking. The org, corporate channel, and Credit billing
// are forced server-side — this form only collects the employee, tests, centre
// and schedule. Prices are hidden: the org's contract rates apply in Crelio.
export function CorporateBook() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [orgs, setOrgs] = useState<CorpOrg[]>([]);
  const [tests, setTests] = useState<{ value: string; label: string }[]>([]);
  const [loadingTests, setLoadingTests] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const centre = Form.useWatch("centreId", form);
  const mode = Form.useWatch("mode", form);

  useEffect(() => {
    getMyOrgs().then((r) => setOrgs(r.orgs)).catch((e) => message.error(e.message));
  }, []);

  const centres = useMemo(
    () => [...new Set(orgs.map((o) => o.centre_id))].map((c) => ({ value: c, label: CENTRE[c] ?? c })),
    [orgs],
  );
  const centreOrgs = useMemo(() => orgs.filter((o) => o.centre_id === centre), [orgs, centre]);

  useEffect(() => {
    form.setFieldValue("crelioOrgId", centreOrgs.length === 1 ? centreOrgs[0].crelio_org_id : undefined);
    if (!centre) { setTests([]); return; }
    setLoadingTests(true);
    supabaseClient
      .from("catalogue_tests")
      .select("crelio_test_id, test_name")
      .eq("centre_id", centre)
      .order("test_name")
      .limit(5000)
      .then(({ data }) => {
        setTests((data ?? []).map((t) => ({ value: t.crelio_test_id as string, label: t.test_name as string })));
        setLoadingTests(false);
      });
  }, [centre]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onFinish(v: any) {
    setSubmitting(true);
    try {
      const res = await corporateBook({
        centreId: v.centreId,
        crelioOrgId: v.crelioOrgId,
        patient: {
          name: v.name, mobile: v.mobile || undefined, age: Number(v.age),
          gender: v.gender, email: v.email || undefined,
        },
        tests: (v.tests as string[]).map((id) => ({ crelioTestId: id })),
        ...(v.mode === "appointment" && v.apptRange
          ? { appointment: { startDate: v.apptRange[0].toISOString(), endDate: v.apptRange[1].toISOString() } }
          : {}),
        ...(v.mode === "home"
          ? { homeCollection: { dateTime: v.hcDateTime?.toISOString(), address: v.hcAddress } }
          : {}),
        comments: v.comments || undefined,
      });
      message.success("Appointment booked");
      navigate(`/corporate/orders/${res.orderId}`);
    } catch (err: any) {
      message.error(err?.message ?? "Booking failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <Typography.Title level={4} style={{ margin: "0 0 12px" }}>Book an appointment</Typography.Title>
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="Booked under your organisation — contract rates apply and the bill goes to your corporate account." />

      <Form form={form} layout="vertical" onFinish={onFinish}
        initialValues={{ gender: "M", mode: "appointment" }}>
        <Card title="Centre" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12}>
              <Form.Item name="centreId" label="Centre" rules={[{ required: true }]}>
                <Select options={centres} placeholder={centres.length ? "Select centre" : "No centres enabled — contact Cadabams"} />
              </Form.Item>
            </Col>
            {centreOrgs.length > 1 && (
              <Col xs={24} sm={12}>
                <Form.Item name="crelioOrgId" label="Billing organisation" rules={[{ required: true }]}>
                  <Select options={centreOrgs.map((o) => ({ value: o.crelio_org_id, label: o.org_label ?? `#${o.crelio_org_id}` }))} />
                </Form.Item>
              </Col>
            )}
          </Row>
        </Card>

        <Card title="Employee / patient" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12}><Form.Item name="name" label="Full name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="mobile" label="Mobile"><Input inputMode="numeric" /></Form.Item></Col>
            <Col xs={12} sm={6}><Form.Item name="age" label="Age" rules={[{ required: true }]}><InputNumber style={{ width: "100%" }} min={0} max={130} /></Form.Item></Col>
            <Col xs={12} sm={6}>
              <Form.Item name="gender" label="Gender">
                <Radio.Group><Radio.Button value="M">M</Radio.Button><Radio.Button value="F">F</Radio.Button><Radio.Button value="O">O</Radio.Button></Radio.Group>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}><Form.Item name="email" label="Email (optional)"><Input type="email" /></Form.Item></Col>
          </Row>
        </Card>

        <Card title="Tests" size="small" style={{ marginBottom: 16 }}>
          <Form.Item name="tests" rules={[{ required: true, message: "Pick at least one test" }]}>
            <Select
              mode="multiple" showSearch optionFilterProp="label"
              loading={loadingTests} disabled={!centre}
              placeholder={centre ? "Search tests / profiles…" : "Select a centre first"}
              options={tests}
            />
          </Form.Item>
        </Card>

        <Card title="Schedule" size="small" style={{ marginBottom: 16 }}>
          <Form.Item name="mode">
            <Radio.Group>
              <Radio.Button value="appointment">Appointment</Radio.Button>
              <Radio.Button value="home">Home collection</Radio.Button>
              <Radio.Button value="walkin">Walk-in</Radio.Button>
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
              <Form.Item name="hcAddress" label="Address" rules={[{ required: true }]}>
                <Input.TextArea rows={2} />
              </Form.Item>
            </>
          )}
          <Form.Item name="comments" label="Notes (optional)"><Input.TextArea rows={2} /></Form.Item>
        </Card>

        <Button type="primary" size="large" htmlType="submit" loading={submitting} block>
          Book appointment
        </Button>
      </Form>
    </div>
  );
}
