import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Form, Input, InputNumber, Select, Radio, DatePicker, Button, Space,
  Typography, message, Divider, Row, Col,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { supabaseClient } from "../../lib/supabase";
import { createBooking, type BookingPayload } from "../../lib/api";

const CENTRES = [
  { value: "KYL", label: "Kalyan Nagar" },
  { value: "JNR", label: "Jayanagar" },
  { value: "KKP", label: "Kanakapura" },
  { value: "BSK", label: "Banashankari" },
];

type TestOpt = { value: string; label: string };

export function BookingNew() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [testOpts, setTestOpts] = useState<TestOpt[]>([]);
  const [loadingTests, setLoadingTests] = useState(false);

  const centre = Form.useWatch("centreId", form);
  const channel = Form.useWatch("channel", form);
  const mode = Form.useWatch("mode", form);

  // Load this centre's catalogue as test options
  useEffect(() => {
    if (!centre) { setTestOpts([]); return; }
    setLoadingTests(true);
    supabaseClient
      .from("catalogue_tests")
      .select("crelio_test_id, test_name")
      .eq("centre_id", centre)
      .order("test_name")
      .limit(5000)
      .then(({ data }) => {
        setTestOpts((data ?? []).map((t) => ({ value: t.crelio_test_id as string, label: t.test_name as string })));
        setLoadingTests(false);
        form.setFieldValue("tests", []);
      });
  }, [centre]); // eslint-disable-line react-hooks/exhaustive-deps

  const testLabel = useMemo(() => {
    const m = new Map(testOpts.map((o) => [o.value, o.label]));
    return (id: string) => m.get(id) ?? id;
  }, [testOpts]);

  async function onFinish(v: any) {
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
      },
      tests: (v.tests ?? []).map((id: string) => ({ crelioTestId: id, testName: testLabel(id) })),
      payment: {
        totalAmount: Number(v.totalAmount ?? 0),
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
    <div style={{ padding: "0 24px 40px", maxWidth: 820 }}>
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
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="centreId" label="Centre" rules={[{ required: true }]}>
                <Select options={CENTRES} placeholder="Select centre" />
              </Form.Item>
            </Col>
            <Col span={12}>
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
            <Form.Item name="organizationIdLH" label="Crelio Organization ID" extra="Applies the corporate rate list; bill goes to CREDIT.">
              <InputNumber style={{ width: 240 }} placeholder="organizationIdLH" />
            </Form.Item>
          )}
        </Card>

        <Card title="Patient" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="name" label="Full name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="mobile" label="Mobile"><Input /></Form.Item></Col>
            <Col span={6}><Form.Item name="age" label="Age" rules={[{ required: true }]}><InputNumber style={{ width: "100%" }} min={0} max={130} /></Form.Item></Col>
            <Col span={6}>
              <Form.Item name="gender" label="Gender">
                <Radio.Group><Radio.Button value="M">M</Radio.Button><Radio.Button value="F">F</Radio.Button><Radio.Button value="O">O</Radio.Button></Radio.Group>
              </Form.Item>
            </Col>
            <Col span={12}><Form.Item name="dob" label="DOB (optional)"><DatePicker style={{ width: "100%" }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="email" label="Email (optional)"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="city" label="City (optional)"><Input /></Form.Item></Col>
          </Row>
        </Card>

        <Card title="Tests" size="small" style={{ marginBottom: 16 }}>
          <Form.Item name="tests" label="Select tests / profiles" rules={[{ required: true, message: "Pick at least one test" }]}>
            <Select
              mode="multiple"
              showSearch
              loading={loadingTests}
              disabled={!centre}
              placeholder={centre ? "Search the catalogue…" : "Select a centre first"}
              options={testOpts}
              optionFilterProp="label"
              maxTagCount="responsive"
            />
          </Form.Item>
        </Card>

        <Card title="Payment" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="paymentType" label="Payment type">
                <Select options={[{ value: "Cash", label: "Cash" }, { value: "Online", label: "Online" }, { value: "Credit", label: "Credit" }]} />
              </Form.Item>
            </Col>
            <Col span={8}><Form.Item name="totalAmount" label="Total amount"><InputNumber style={{ width: "100%" }} min={0} prefix="₹" /></Form.Item></Col>
            <Col span={8}><Form.Item name="advance" label="Advance (optional)"><InputNumber style={{ width: "100%" }} min={0} prefix="₹" /></Form.Item></Col>
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
