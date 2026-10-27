import React from "react";
import dayjs from "dayjs";
import {
  Form,
  Row,
  Col,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Checkbox,
  Button,
  Collapse,
  type FormInstance,
} from "antd";
import {
  STATES_OBJECT,
  STATE_WISE_CITIES,
} from "@/shared/lib/constants";
import { LeadsManagement } from "../../types/types";
import { ExportIncoterm } from "../../types/crmVerticals";
import type { BusinessCustomField } from "@/features/onboarding";

const { TextArea } = Input;

interface LeadDetailsTabProps {
  form: FormInstance;
  lead: LeadsManagement;
  onSubmit: (values: Record<string, unknown>) => void;
  submitLoading: boolean;
  sourceOptions: Array<{ label: string; value: string }>;
  priorityOptions: Array<{ label: string; value: string }>;
  isExport?: boolean;
  customFields?: BusinessCustomField[];
}

const INCOTERM_OPTIONS: Array<{ label: string; value: ExportIncoterm }> = [
  { label: "FOB - Free On Board", value: "FOB" },
  { label: "CIF - Cost, Insurance & Freight", value: "CIF" },
  { label: "EXW - Ex Works", value: "EXW" },
  { label: "CFR - Cost & Freight", value: "CFR" },
  { label: "DDP - Delivered Duty Paid", value: "DDP" },
  { label: "CIP - Carriage & Insurance Paid", value: "CIP" },
  { label: "FCA - Free Carrier", value: "FCA" },
];

export const LeadDetailsTab: React.FC<LeadDetailsTabProps> = ({
  form,
  lead,
  onSubmit,
  submitLoading,
  sourceOptions,
  priorityOptions,
  isExport = false,
  customFields = [],
}) => {
  const selectedState = Form.useWatch("state", form) || lead?.state;
  const fieldsToRender = customFields.filter((field) => field.active);
  const customFieldGroups = fieldsToRender.reduce<Record<string, BusinessCustomField[]>>(
    (groups, field) => {
      const group = field.fieldGroup.trim() || "General";
      (groups[group] ??= []).push(field);
      return groups;
    },
    {},
  );

  const renderCustomField = (field: BusinessCustomField) => {
    const dataType = field.dataType.toLowerCase();
    const options = field.options.flatMap((option) => {
      if (typeof option === "string" || typeof option === "number") {
        return [{ label: String(option), value: option }];
      }
      if (typeof option !== "object" || option === null) return [];
      const record = option as Record<string, unknown>;
      const value = record.value;
      const label = record.label;
      if (
        (typeof value !== "string" && typeof value !== "number") ||
        (typeof label !== "string" && typeof label !== "number")
      ) {
        return [];
      }
      return [{ label: String(label), value }];
    });
    const commonProps = {
      label: field.fieldName,
      name: ["customFields", field.fieldKey],
      initialValue: dataType === "date" && lead.customFields?.[field.fieldKey]
        ? dayjs(String(lead.customFields[field.fieldKey])) : lead.customFields?.[field.fieldKey],
      rules: field.isRequired
        ? [{ required: true, message: `${field.fieldName} is required` }]
        : [],
    };

    let control;
    let valuePropName: "value" | "checked" = "value";
    if (dataType === "boolean" || dataType === "checkbox") {
      control = <Checkbox />;
      valuePropName = "checked";
    } else if (["number", "integer", "decimal", "currency"].includes(dataType)) {
      control = <InputNumber style={{ width: "100%" }} />;
    } else if (dataType === "date") {
      control = <DatePicker style={{ width: "100%" }} />;
    } else if (["select", "dropdown", "enum"].includes(dataType)) {
      control = <Select allowClear options={options} />;
    } else if (["multi_select", "multiselect"].includes(dataType)) {
      control = <Select allowClear mode="multiple" options={options} />;
    } else {
      control = <Input />;
    }

    return (
      <Col key={field.id} span={8}>
        <Form.Item {...commonProps} valuePropName={valuePropName}
          getValueProps={dataType === "date" ? (value: unknown) => ({ value: value ? dayjs.isDayjs(value) ? value : dayjs(String(value)) : null }) : undefined}
          normalize={dataType === "date" ? (value: unknown) => dayjs.isDayjs(value) ? value.format("YYYY-MM-DD") : value : undefined}
        >
          {control}
        </Form.Item>
      </Col>
    );
  };

  return (
    <div className="flex justify-start items-center">
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        className="w-full max-w-4xl p-6 rounded-lg"
      >
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item
              initialValue={lead?.username}
              label="Customer Name"
              name="customerName"
              rules={[{ required: true, message: "Please enter customer name" }]}
            >
              <Input placeholder="Customer Name" />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item
              label="Mobile"
              name="mobile"
              initialValue={lead?.mobile}
              rules={[
                { required: true, message: "Please enter mobile number" },
                {
                  pattern: /^[0-9]{10}$/,
                  message: "Enter valid 10-digit number",
                },
              ]}
            >
              <Input placeholder="Mobile Number" />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item label="Email ID" name="email" initialValue={lead?.email}>
              <Input placeholder="Email Address" type="email" />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item label="State" name="state" initialValue={lead?.state}>
              <Select
                showSearch
                placeholder="Select State"
                allowClear
                optionFilterProp="label"
                options={STATES_OBJECT?.map((s) => ({
                  label: s.label,
                  value: s.name,
                }))}
              />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item label="City" name="city" initialValue={lead?.city}>
              <Select
                showSearch
                allowClear
                placeholder={selectedState ? "Select City" : "Select a state first"}
                disabled={!selectedState}
                optionFilterProp="label"
                options={
                  selectedState
                    ? STATE_WISE_CITIES[selectedState]?.map((c) => ({
                        label: c.label,
                        value: c.value,
                      })) || []
                    : []
                }
              />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item label="Area" name="area" initialValue={lead?.area}>
              <Input placeholder="Enter Area" />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item
              label="Business Type"
              name="businessType"
              initialValue={lead?.businessType}
            >
              <Input placeholder="Enter Business Type" />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item
              label="Business Name"
              name="businessName"
              initialValue={lead?.businessName}
            >
              <Input placeholder="Business Name" />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item label="Source" name="source" initialValue={lead?.source}>
              <Select
                showSearch
                placeholder="Select Source"
                allowClear
                options={sourceOptions}
              />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item
              label="Priority"
              name="priority"
              initialValue={lead?.priority}
            >
              <Select
                showSearch
                placeholder="Select Priority"
                allowClear
                options={priorityOptions}
              />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              label="Requirement"
              name="requirement"
              initialValue={lead?.requirement}
            >
              <TextArea rows={3} placeholder="Enter customer requirement" />
            </Form.Item>
          </Col>
        </Row>

        {/* Dynamic Vertical Fields: Export Attributes */}
        {isExport && customFields.length === 0 && (
          <div className="mb-6">
            <Collapse
              defaultActiveKey={["export-details"]}
              items={[
                {
                  key: "export-details",
                  label: (
                    <span className="font-semibold text-primary">
                      🌍 International Trade & Export Attributes
                    </span>
                  ),
                  children: (
                    <Row gutter={16}>
                      <Col span={6}>
                        <Form.Item
                          label="HS Code"
                          name={["customFields", "hsCode"]}
                          initialValue={lead?.customFields?.hsCode as string}
                        >
                          <Input placeholder="e.g. 8471.30.10" />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          label="Incoterm"
                          name={["customFields", "incoterm"]}
                          initialValue={lead?.customFields?.incoterm as string}
                        >
                          <Select
                            placeholder="Select Incoterm"
                            allowClear
                            options={INCOTERM_OPTIONS}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          label="Port of Loading"
                          name={["customFields", "portOfLoading"]}
                          initialValue={lead?.customFields?.portOfLoading as string}
                        >
                          <Input placeholder="e.g. Nhava Sheva (INNSA)" />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          label="Port of Discharge"
                          name={["customFields", "portOfDischarge"]}
                          initialValue={lead?.customFields?.portOfDischarge as string}
                        >
                          <Input placeholder="e.g. Port of Rotterdam" />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          label="Destination Country"
                          name={["customFields", "destinationCountry"]}
                          initialValue={lead?.customFields?.destinationCountry as string}
                        >
                          <Input placeholder="e.g. United Kingdom, Germany" />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          label="Currency"
                          name={["customFields", "currency"]}
                          initialValue={(lead?.customFields?.currency as string) || "USD"}
                        >
                          <Select
                            options={[
                              { label: "USD ($)", value: "USD" },
                              { label: "EUR (€)", value: "EUR" },
                              { label: "GBP (£)", value: "GBP" },
                              { label: "AED (د.إ)", value: "AED" },
                              { label: "INR (₹)", value: "INR" },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  ),
                },
              ]}
            />
          </div>
        )}

        {Object.entries(customFieldGroups).map(([group, fields]) => (
          <Collapse
            className="mb-4"
            key={group}
            defaultActiveKey={[group]}
            items={[
              {
                key: group,
                label: <span className="font-semibold">{group}</span>,
                children: (
                  <Row gutter={16}>
                    {fields.map(renderCustomField)}
                  </Row>
                ),
              },
            ]}
          />
        ))}

        <div className="flex justify-center mt-6">
          <Button
            type="primary"
            htmlType="submit"
            loading={submitLoading}
            disabled={submitLoading}
            size="large"
            style={{ width: "200px" }}
          >
            Update Lead Details
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default LeadDetailsTab;
