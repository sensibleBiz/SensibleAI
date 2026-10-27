import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
} from "antd";
import dayjs from "dayjs";
import EventImageUpload from "./EventImageUpload";
import { EventFormValues } from "../types/eventTypes";

const { TextArea } = Input;

interface EventFormProps {
  initialValues?: Partial<EventFormValues>;
  submitLabel: string;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (values: EventFormValues) => void;
}

export default function EventForm({
  initialValues,
  submitLabel,
  loading = false,
  onCancel,
  onSubmit,
}: EventFormProps) {
  const [form] = Form.useForm();
  const preparedInitialValues = initialValues
    ? {
        ...initialValues,
        registrationType:
          initialValues.registrationType ??
          (Number(initialValues.fees ?? 0) > 0 ? "paid" : "free"),
        eventDateTime: initialValues.eventDateTime
          ? dayjs(initialValues.eventDateTime)
          : undefined,
        registrationExpiryDate: initialValues.registrationExpiryDate
          ? dayjs(initialValues.registrationExpiryDate)
          : undefined,
        offerAmount: initialValues.offerAmount ?? 9999,
      }
    : { status: "Active", registrationType: "paid", fees: 0, offerAmount: 9999 };
  const registrationType =
    Form.useWatch("registrationType", form) ??
    preparedInitialValues.registrationType ??
    "paid";
  const isFreeEvent = registrationType === "free";

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={preparedInitialValues}
      onFinish={(values) => {
        const selectedRegistrationType = values.registrationType ?? "paid";

        onSubmit({
          ...values,
          registrationType: selectedRegistrationType,
          fees:
            selectedRegistrationType === "free"
              ? 0
              : Number(values.fees ?? 0),
          eventDateTime: values.eventDateTime.toISOString(),
          registrationExpiryDate: values.registrationExpiryDate.toISOString(),
        });
      }}
      className="grid grid-cols-1 gap-x-4 md:grid-cols-2"
    >
      <Form.Item
        label="Event Name"
        name="name"
        rules={[{ required: true, message: "Event name is required" }]}
      >
        <Input placeholder="Enter event name" />
      </Form.Item>

      <Form.Item
        label="Map Location Link"
        name="location"
        rules={[{ required: true, message: "Map location link is required" }]}
      >
        <Input placeholder="Paste Google Maps location link" />
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
        <Input placeholder="e.g. Bengaluru" />
      </Form.Item>

      <Form.Item
        label="Event Description"
        name="description"
        className="md:col-span-2"
        rules={[{ required: true, message: "Description is required" }]}
      >
        <TextArea rows={4} placeholder="Describe the event" />
      </Form.Item>

      <Form.Item
        label="Address"
        name="address"
        className="md:col-span-2"
        rules={[{ required: true, message: "Address is required" }]}
      >
        <TextArea rows={2} placeholder="Full address or joining details" />
      </Form.Item>

      <Form.Item
        label="Event Date & Time"
        name="eventDateTime"
        rules={[{ required: true, message: "Event date and time is required" }]}
      >
        <DatePicker showTime className="w-full" format="DD MMM YYYY, hh:mm A" />
      </Form.Item>

      <Form.Item
        label="Registration Expiry Date"
        name="registrationExpiryDate"
        rules={[{ required: true, message: "Expiry date is required" }]}
      >
        <DatePicker showTime className="w-full" format="DD MMM YYYY, hh:mm A" />
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
          className="w-full"
          disabled={isFreeEvent}
          prefix="Rs."
          placeholder={isFreeEvent ? "Free event" : "Enter amount"}
        />
      </Form.Item>

      <Form.Item label="Offer Amount" name="offerAmount">
        <InputNumber
          min={1}
          className="w-full"
          prefix="Rs."
          placeholder="Enter offer amount"
        />
      </Form.Item>

      <Form.Item
        label="Status"
        name="status"
        rules={[{ required: true, message: "Status is required" }]}
      >
        <Select
          options={[
            { label: "Active", value: "Active" },
            { label: "Inactive", value: "Inactive" },
          ]}
        />
      </Form.Item>

      <div className="md:col-span-2">
        <div className="mb-2 text-sm font-medium text-slate-700">
          Event Images
        </div>
        <EventImageUpload form={form} />
      </div>

      <Form.Item
        label="Terms & Conditions"
        name="terms"
        className="md:col-span-2"
        rules={[{ required: true, message: "Terms are required" }]}
      >
        <TextArea rows={3} placeholder="Enter registration terms" />
      </Form.Item>

      <div className="flex flex-col-reverse gap-2 md:col-span-2 md:flex-row md:justify-end">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="primary" htmlType="submit" loading={loading}>
          {submitLabel}
        </Button>
      </div>
    </Form>
  );
}
