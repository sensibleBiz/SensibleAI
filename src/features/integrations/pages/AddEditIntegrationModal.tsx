import { Modal, Form, Input, Button, Select, Switch } from "antd";
import { useEffect, useState } from "react";
import { IntegrationConfig } from "../types/types";
import { APP_MESSAGES } from "@/shared/lib/constants";
import { useMessageApi } from "@/shared/hooks";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import type { TeamTreeDTO } from "@/features/team";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";
import { teamTreeApi } from "@/features/team";
import { integrationApi } from "../api/integrationApi";

interface Props {
  open: boolean;
  onClose: () => void;
  initialData?: IntegrationConfig | null;
  prefillData?: Partial<IntegrationConfig> | null;
  onSaved: (integration: IntegrationConfig) => void;
}

const AddEditIntegrationModal: React.FC<Props> = ({
  open,
  onClose,
  initialData,
  prefillData,
  onSaved,
}) => {
  const [form] = Form.useForm<IntegrationConfig>();
  const [loading, setLoading] = useState(false);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [salesEmployees, setSalesEmployees] = useState<TeamTreeDTO[]>([]);
  const outletId = useSelector((state: RootState) => state?.appState?.outletInfo?.id);
  const messageApi = useMessageApi();
  const selectedPlatform = Form.useWatch("type", form);
  const autoAssignEnabled = Form.useWatch("autoassignenabled", form) ?? false;

  useEffect(() => {
    if (!open || !outletId) {
      setSalesEmployees([]);
      return;
    }

    setEmployeeLoading(true);
    void teamTreeApi.list(outletId, true).then(({ items: members }) => {
        setSalesEmployees(
          members
            .filter(
              (member) =>
                member.isActive &&
                member.department?.trim().toUpperCase() === "SALES" &&
                Boolean(member.userProfileId)
            )
            .sort((first, second) => first.userName.localeCompare(second.userName))
        );
        setEmployeeLoading(false);
      }).catch((error) => {
        console.error("Error loading active sales employees:", error);
        messageApi.error("Unable to load active sales employees");
        setEmployeeLoading(false);
      });
  }, [messageApi, open, outletId]);
  useEffect(() => {
    if (initialData) {
      form.setFieldsValue({
        ...initialData,
        // Older Facebook integrations only stored the selected employee.
        autoassignenabled:
          initialData.autoassignenabled ?? Boolean(initialData.autoAssignUserId),
      });
      return;
    }

    form.resetFields();
    form.setFieldsValue({
      ...prefillData,
      autoassignenabled: prefillData?.autoassignenabled ?? false,
    });
  }, [initialData, prefillData, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (!outletId) {
      messageApi.error("Outlet is missing. Please refresh and try again.");
      return;
    }

    setLoading(true);
    try {
      const isFacebook = values.type?.trim().toUpperCase() === "FB";
      const selectedEmployee = salesEmployees.find(
        (employee) => employee.userProfileId === values.autoAssignUserId
      );
      const shouldAutoAssign = isFacebook && values.autoassignenabled === true;
      const integrationValues = {
        ...values,
        integrationKey: values.integrationKey.trim(),
        autoassignenabled: shouldAutoAssign,
        autoAssignUserId: shouldAutoAssign ? values.autoAssignUserId : "",
        autoAssignEmployeeName: shouldAutoAssign
          ? selectedEmployee?.userName || initialData?.autoAssignEmployeeName || ""
          : "",
        outletId,
        isActive: initialData?.isActive ?? true,
      };
      const saved = initialData
        ? await integrationApi.update(initialData.id, integrationValues)
        : await integrationApi.create(integrationValues);
      onSaved(saved);

      messageApi.success(
        initialData ? APP_MESSAGES.SUCCESS_UPDATE : APP_MESSAGES.SUCCESS_CREATE
      );
      onClose();
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "Unable to save integration"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title={initialData ? "Edit Integration" : "Add Integration"}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="integrationKey"
          label={
            selectedPlatform?.trim().toUpperCase() === "FB"
              ? "Facebook Ad ID"
              : "Integration Key"
          }
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="accessToken"
          label="Access Token"
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          name="type"
          label="Platform"
          rules={[{ required: true }]}
        >
          <Select            
            options={[
              { label: "Facebook", value: "FB" },
              { label: "Justdial", value: "JD" },
              { label: "Google", value: "GOOGLE" },
              { label: "Instagram", value: "IG" },
              { label: "Indiamart", value: "IM" },
              { label: "MINOP", value: "MINOP" },
              { label: "HIKVISION", value: "HIKVISION" },
            ]}
          />
        </Form.Item>

        {selectedPlatform?.trim().toUpperCase() === "FB" && (
          <>
            <Form.Item
              name="autoassignenabled"
              label="Auto Assign"
              valuePropName="checked"
              extra={
                autoAssignEnabled
                  ? "Matching Facebook leads will be assigned automatically."
                  : "Leads will remain unassigned for manual assignment."
              }
            >
              <Switch checkedChildren="On" unCheckedChildren="Off" />
            </Form.Item>

            {autoAssignEnabled && (
              <Form.Item
                name="autoAssignUserId"
                label="Auto-assign leads to"
                rules={[
                  {
                    required: true,
                    message: "Select an active sales employee",
                  },
                ]}
                extra="Every new lead matching this Facebook ad ID will be assigned to this employee."
              >
                <Select
                  showSearch
                  loading={employeeLoading}
                  placeholder="Select active sales employee"
                  optionFilterProp="label"
                  notFoundContent={
                    employeeLoading
                      ? "Loading employees..."
                      : "No active sales employees found"
                  }
                  options={salesEmployees.map((employee) => ({
                    label: formatEmployeeName(employee.userName),
                    value: employee.userProfileId,
                  }))}
                />
              </Form.Item>
            )}
          </>
        )}

        <Button
          type="primary"
          block
          loading={loading}
          onClick={handleSubmit}
        >
          {initialData ? "Update" : "Add"}
        </Button>
      </Form>
    </Modal>
  );
};

export default AddEditIntegrationModal;
