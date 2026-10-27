import { useEffect, useMemo, useState } from "react";
import { Button, Card, DatePicker, Form, Input, Radio, Select, Statistic, Typography } from "antd";
import { CalendarPlus } from "lucide-react";
import { useSelector } from "react-redux";
import dayjs, { type Dayjs } from "dayjs";
import type { RootState } from "@/app/store";
import { leaveApi, type LeaveTypeOption } from "../api/leaveApi";
import { useLeaveBalance } from "@/features/leave/hooks/useLeaveBalance";
import { useMessageApi } from "@/shared/hooks";

const { RangePicker } = DatePicker;
const { TextArea } = Input;
const { Text } = Typography;

interface LeaveFormValues {
  leaveTypeId: string;
  dates: [Dayjs, Dayjs];
  duration: "Full Day" | "Half Day";
  leaveNote: string;
}

const ApplyLeavePage = () => {
  const outletId = useSelector((state: RootState) => state.appState.outletInfo?.id);
  const userId = useSelector((state: RootState) => state.auth.user?.id ?? "");
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<LeaveFormValues>();
  const messageApi = useMessageApi();
  const selectedDates = Form.useWatch("dates", form);
  const duration = Form.useWatch("duration", form) ?? "Full Day";
  const selectedYear = selectedDates?.[0]?.year() ?? dayjs().year();
  const { leaveBalances, loading: balanceLoading, refetch } = useLeaveBalance({
    userId: userId || undefined,
    year: selectedYear,
    enabled: Boolean(userId),
  });
  const balance = leaveBalances[0];

  useEffect(() => {
    const controller = new AbortController();
    if (!outletId) return () => controller.abort();
    void leaveApi.listTypes(outletId, controller.signal)
      .then((result) => setLeaveTypes(result.items))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        messageApi.error(error instanceof Error ? error.message : "Failed to load leave types");
      });
    return () => controller.abort();
  }, [messageApi, outletId]);

  const estimatedDays = useMemo(() => {
    if (!selectedDates?.[0] || !selectedDates[1]) return 0;
    if (duration === "Half Day") return 0.5;
    return selectedDates[1].startOf("day").diff(selectedDates[0].startOf("day"), "day") + 1;
  }, [duration, selectedDates]);

  const submit = async () => {
    if (!outletId) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const result = await leaveApi.createRequest({
        outletId,
        leaveTypeId: values.leaveTypeId,
        fromDate: values.dates[0].startOf("day").valueOf(),
        toDate: values.dates[1].endOf("day").valueOf(),
        duration: values.duration,
        leaveNote: values.leaveNote,
      });
      messageApi.success(`Leave request submitted for ${result.item.noDays} day(s)`);
      form.resetFields();
      form.setFieldValue("duration", "Full Day");
      await refetch();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "Failed to submit leave request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 rounded-xl bg-[#0a3750] px-6 py-5 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <CalendarPlus size={24} className="text-[#ff3228]" />
            <div>
              <h1 className="m-0 text-xl font-semibold">Apply Leave</h1>
              <p className="mb-0 mt-1 text-sm text-slate-200">Submit a request for manager approval.</p>
            </div>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card loading={balanceLoading}><Statistic title="Allocated" value={balance?.totalLeaves ?? 0} /></Card>
          <Card loading={balanceLoading}><Statistic title="Used" value={balance?.usedLeaves ?? 0} /></Card>
          <Card loading={balanceLoading}><Statistic title="Available" value={balance?.remainingLeaves ?? 0} /></Card>
        </div>

        <Card title="Leave request" className="!rounded-xl shadow-sm">
          <Form form={form} layout="vertical" initialValues={{ duration: "Full Day" }}>
            <Form.Item name="leaveTypeId" label="Leave type" rules={[{ required: true, message: "Select a leave type" }]}>
              <Select
                placeholder="Select leave type"
                options={leaveTypes.map((item) => ({ value: item.id, label: `${item.name} (${item.shortCode})` }))}
              />
            </Form.Item>
            <Form.Item name="dates" label="Dates" rules={[{ required: true, message: "Select leave dates" }]}>
              <RangePicker className="w-full" disabledDate={(date) => date.isBefore(dayjs().startOf("day"))} />
            </Form.Item>
            <Form.Item name="duration" label="Duration" rules={[{ required: true }]}>
              <Radio.Group>
                <Radio value="Full Day">Full day</Radio>
                <Radio value="Half Day" disabled={Boolean(selectedDates?.[0] && selectedDates?.[1] && !selectedDates[0].isSame(selectedDates[1], "day"))}>
                  Half day
                </Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item name="leaveNote" label="Reason" rules={[{ required: true, min: 2, max: 2000 }]}>
              <TextArea rows={4} placeholder="Reason for leave" />
            </Form.Item>
            <div className="mb-4 rounded-lg bg-slate-50 p-3">
              <Text>Estimated days: <strong>{estimatedDays}</strong>. The server validates and calculates the final value.</Text>
            </div>
            <Button type="primary" loading={submitting} onClick={() => void submit()} style={{ background: "#0a3750" }}>
              Submit request
            </Button>
          </Form>
        </Card>
      </div>
    </div>
  );
};

export default ApplyLeavePage;
