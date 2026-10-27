import {
  Button,
  Card,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  message,
} from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import EventImageUpload from "@/features/events/components/EventImageUpload";
import { createEvent } from "@/features/events/api/eventApi";
import { RootState } from "@/app/store";
import { EventFormValues } from "../../types/eventTypes";

const { TextArea } = Input;

const sectionLabelClass =
  "text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 sm:mb-3 mt-1";

export default function CreateEventPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo?.id
  );
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const registrationType = Form.useWatch("registrationType", form) ?? "paid";
  const isFreeEvent = registrationType === "free";
  const requestedDate = searchParams.get("date");
  const requestedEventDate =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? dayjs(requestedDate).hour(10).minute(0).second(0)
      : undefined;

  const handleCreate = async (values: EventFormValues) => {
    const selectedRegistrationType = values.registrationType ?? "paid";

    setSaving(true);

    try {
      await createEvent(
        {
          ...values,
          registrationType: selectedRegistrationType,
          fees:
            selectedRegistrationType === "free"
              ? 0
              : Number(values.fees ?? 0),
        },
        outletId
      );
      message.success("Event created successfully");
      form.resetFields();
      navigate("/events");
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Failed to create event"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="mb-5 px-4 sm:px-6">
        <h1 className="m-0 text-2xl font-semibold text-slate-900">
          Create Event
        </h1>
        <p className="m-0 text-sm text-slate-500">
          Create a public registration link for an event.
        </p>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          status: "Active",
          registrationType: "paid",
          fees: 0,
          offerAmount: 9999,
          eventImages: [],
          eventDateTime: requestedEventDate?.isValid()
            ? requestedEventDate
            : undefined,
        }}
        onFinish={(values) =>
          handleCreate({
            ...values,
            registrationType: values.registrationType ?? "paid",
            fees:
              values.registrationType === "free"
                ? 0
                : Number(values.fees ?? 0),
            eventDateTime: values.eventDateTime.toISOString(),
            registrationExpiryDate: values.registrationExpiryDate.toISOString(),
          })
        }
        className="w-full px-4 sm:px-6"
        requiredMark={(label, { required }) => (
          <span className="flex items-center gap-1">
            {label}
            {required && <span className="text-[#ff3228]">*</span>}
          </span>
        )}
      >
        <div className={sectionLabelClass}>Event Details</div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-0 sm:grid-cols-2 xl:grid-cols-3">
          <Form.Item
            label="Event Name"
            name="name"
            rules={[{ required: true, message: "Event name is required" }]}
          >
            <Input placeholder="e.g. Annual Partner Meetup 2026" size="large" />
          </Form.Item>

          <Form.Item
            label="Map Location Link"
            name="location"
            rules={[{ required: true, message: "Map location link is required" }]}
          >
            <Input placeholder="Paste Google Maps location link" size="large" />
          </Form.Item>

          <Form.Item
            label="City"
            name="city"
            rules={[
              {
                required: true,
                whitespace: true,
                message: "City is required",
              },
            ]}
          >
            <Input placeholder="e.g. Bengaluru" size="large" />
          </Form.Item>

          <Form.Item
            label="Event Description"
            name="description"
            className="sm:col-span-2 xl:col-span-3"
            rules={[{ required: true, message: "Description is required" }]}
          >
            <TextArea
              rows={4}
              placeholder="Describe the event, agenda, and highlights"
              className="resize-none"
            />
          </Form.Item>

          <Form.Item
            label="Address"
            name="address"
            className="sm:col-span-2 xl:col-span-3"
            rules={[{ required: true, message: "Address is required" }]}
          >
            <TextArea
              rows={2}
              placeholder="Full address or joining details"
              className="resize-none"
            />
          </Form.Item>
        </div>

        <Divider className="!my-4 sm:!my-6" />

        <div className={sectionLabelClass}>Schedule &amp; Fees</div>
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Form.Item
            label="Event Date & Time"
            name="eventDateTime"
            rules={[
              { required: true, message: "Event date and time is required" },
            ]}
          >
            <DatePicker
              showTime
              className="w-full"
              size="large"
              format="DD MMM YYYY, hh:mm A"
            />
          </Form.Item>

          <Form.Item
            label="Registration Expiry Date"
            name="registrationExpiryDate"
            rules={[{ required: true, message: "Expiry date is required" }]}
          >
            <DatePicker
              showTime
              className="w-full"
              size="large"
              format="DD MMM YYYY, hh:mm A"
            />
          </Form.Item>

          <Form.Item
            label="Event Type"
            name="registrationType"
            rules={[{ required: true, message: "Event type is required" }]}
          >
            <Radio.Group
              buttonStyle="solid"
              onChange={(event) => {
                if (event.target.value === "free") {
                  form.setFieldValue("fees", 0);
                }
              }}
              optionType="button"
              options={[
                { label: "Paid", value: "paid" },
                { label: "Free", value: "free" },
              ]}
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="Fees / Amount"
            name="fees"
            dependencies={["registrationType"]}
            rules={[
              { required: !isFreeEvent, message: "Fees is required" },
              {
                validator: (_, value) =>
                  isFreeEvent || Number(value ?? 0) > 0
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error("Fees must be greater than 0 for paid events")
                      ),
              },
            ]}
          >
            <InputNumber
              min={0}
              size="large"
              className="w-full"
              disabled={isFreeEvent}
              prefix="Rs."
              placeholder={isFreeEvent ? "Free event" : "0"}
            />
          </Form.Item>

          <Form.Item label="Offer Amount" name="offerAmount">
            <InputNumber
              min={1}
              size="large"
              className="w-full"
              prefix="Rs."
              placeholder="0"
            />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Form.Item
            label="Status"
            name="status"
            rules={[{ required: true, message: "Status is required" }]}
          >
            <Select
              size="large"
              options={[
                { label: "Active", value: "Active" },
                { label: "Inactive", value: "Inactive" },
              ]}
            />
          </Form.Item>
        </div>

        <Divider className="!my-4 sm:!my-6" />

        <div className={sectionLabelClass}>Event Images</div>
        <EventImageUpload form={form} />

        <Divider className="!my-4 sm:!my-6" />

        <div className={sectionLabelClass}>Terms &amp; Conditions</div>
        <Form.Item
          name="terms"
          rules={[{ required: true, message: "Terms are required" }]}
        >
          <TextArea
            rows={3}
            placeholder="Enter registration terms"
            className="resize-none"
          />
        </Form.Item>

        <div className="sticky bottom-0 -mx-4 mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:-mx-6 sm:mt-8 sm:flex-row sm:justify-end sm:px-6 sm:py-4">
          <Button
            size="large"
            onClick={() => navigate("/events")}
            className="w-full sm:w-auto sm:min-w-28"
          >
            Cancel
          </Button>
          <Button
            size="large"
            type="primary"
            htmlType="submit"
            loading={saving}
            className="w-full !bg-[#0a3750] !text-white hover:!bg-[#0a3750]/90 sm:w-auto sm:min-w-32"
          >
            Create Event
          </Button>
        </div>
      </Form>
    </Card>
  );
}
