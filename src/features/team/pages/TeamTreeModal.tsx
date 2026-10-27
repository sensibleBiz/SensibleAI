import { TeamTreeDTO } from "../types/types";
import { UserProfile } from "@/features/auth";
import { ROLES, ZONE_LIST } from "@/shared/lib/constants";
import { Modal, Form, Select, Button, Row, Col, Input, Radio } from "antd";
import { useEffect } from "react";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";

const { Option } = Select;

interface TeamTreeModalProps {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: TeamTreeFormValues) => void;
  initialValues?: Partial<TeamTreeDTO>; // when editing
  users: UserProfile[]; // user dropdown list
  teamTreeData?: TeamTreeDTO[]; // existing team tree data to prevent duplicates
  postgresMode?: boolean;
  teamHeadList?: TeamTreeDTO[]; // optional
  zoneHeadList?: TeamTreeDTO[]; // optional
}

export type TeamTreeFormValues = Partial<TeamTreeDTO> & {
  employeeMode?: "existing" | "new";
  newUserName?: string;
  newUserMobile?: string;
  newUserEmail?: string;
  newUserPassword?: string;
};

export default function TeamTreeModal({
  open,
  onClose,
  onSubmit,
  initialValues,
  users,
  teamTreeData = [],
  postgresMode = false,
  teamHeadList = [],
  zoneHeadList = [],
  loading,
}: TeamTreeModalProps) {
  const [form] = Form.useForm();
  const employeeMode = Form.useWatch("employeeMode", form) || (postgresMode ? "new" : "existing");
  
  // Get set of existing userProfileIds to prevent duplicates
  const existingUserProfileIds = new Set(
    teamTreeData?.map((team) => team?.userProfileId).filter(Boolean) || []
  );

  // 🔥 Reset or fill form based on mode
  useEffect(() => {
    if (open) {
      form.resetFields();
      if (initialValues) {
        form.setFieldsValue({ employeeMode: "existing", ...initialValues });
      } else {
        form.setFieldsValue({
          employeeMode: postgresMode ? "new" : "existing",
          isActive: true,
          roleInZone: ROLES.USER,
        });
      }
    } else {
      // Reset form when modal closes to prevent data persistence
      form.resetFields();
    }
  }, [open, initialValues, form, postgresMode]);

  const handleFinish = (values: TeamTreeFormValues) => {
    onSubmit(values);
  };

  const employeeOptionLabel = (user: UserProfile) => {
    const name = formatEmployeeName(user?.name);
    return user?.phone_number ? `${name} - ${user.phone_number}` : name;
  };

  return (
    <Modal
      title={initialValues ? "Edit Team Member" : "Add User to Team"}
      open={open}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      footer={null}
      destroyOnClose={true}
      width={650}
    >
      <Form
        layout="vertical"
        form={form}
        onFinish={handleFinish}
        initialValues={initialValues}
      >
        <Form.Item name="id" hidden>
          <input />
        </Form.Item>
        <Form.Item
          name="employeeMode"
          hidden={!!initialValues || postgresMode}
          label="Add Employee"
        >
          <Radio.Group buttonStyle="solid">
            <Radio.Button value="existing">Select Existing</Radio.Button>
            <Radio.Button value="new">Create New User</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Row gutter={16}>
          {(initialValues || employeeMode === "existing") && (
            <Col xs={24} sm={12}>
              <Form.Item
                name="userProfileId"
                label="Employee Name / Mobile No."
                rules={[{ required: true, message: "Select an employee" }]}
              >
                <Select
                  placeholder="Search employee by name or mobile"
                  showSearch
                  optionFilterProp="label"
                  disabled={!!initialValues}
                >
                  {users?.map((u) => {
                    const isDisabled =
                      existingUserProfileIds.has(u?.id) && !initialValues;
                    return (
                      <Option
                        key={u?.id}
                        value={u?.id}
                        label={employeeOptionLabel(u)}
                        disabled={isDisabled}
                      >
                        {employeeOptionLabel(u)}
                      </Option>
                    );
                  })}
                </Select>
              </Form.Item>
            </Col>
          )}
          {!initialValues && employeeMode === "new" && (
            <>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="newUserName"
                  label="Employee Name"
                  rules={[
                    {
                      required: true,
                      whitespace: true,
                      message: "Employee name is required",
                    },
                    { min: 2, max: 120 },
                  ]}
                >
                  <Input placeholder="Enter employee name" allowClear />
                </Form.Item>
              </Col>
              {postgresMode && (
                <Col xs={24} sm={12}>
                  <Form.Item name="newUserEmail" label="Email" rules={[{ required: true, type: "email" }]}>
                    <Input placeholder="employee@example.com" allowClear />
                  </Form.Item>
                </Col>
              )}
              {postgresMode && (
                <Col xs={24} sm={12}>
                  <Form.Item name="newUserPassword" label="Temporary Password" rules={[{ required: true }, { min: 10 }]}>
                    <Input.Password placeholder="Minimum 10 characters" />
                  </Form.Item>
                </Col>
              )}
              <Col xs={24} sm={12}>
                <Form.Item
                  name="newUserMobile"
                  label="Mobile Number"
                  extra="If this number already has an account, that user will be linked to this outlet."
                  getValueFromEvent={(event) =>
                    String(event?.target?.value ?? "")
                      .replace(/\D/g, "")
                      .slice(0, 10)
                  }
                  rules={[
                    { required: !postgresMode, message: "Mobile number is required" },
                    {
                      pattern: /^[6-9]\d{9}$/,
                      message: "Enter a valid 10-digit Indian mobile number",
                    },
                  ]}
                >
                  <Input
                    addonBefore="+91"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="9876543210"
                    allowClear
                  />
                </Form.Item>
              </Col>
            </>
          )}
          <Col xs={24} sm={12}>
            <Form.Item
              name="department"
              label="Department Name"
              rules={[{ required: true }]}
            >
              <Select
                placeholder="Select Department"
                showSearch
                optionFilterProp="label"
              >
                <Option value={"SALES"}>Sales</Option>
                <Option value={"IT"}>IT</Option>
                <Option value={"HR"}>HR</Option>
                <Option value={"ACCOUNT"}>Account</Option>
                <Option value={"SUPPORT"}>Support</Option>
                <Option value={"HARDWARE"}>Hardware</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="zoneList" label="Zone List">
              <Select mode="multiple" placeholder="Select Zones">
                {ZONE_LIST?.map((z) => (
                  <Option key={z} value={z}>
                    {z}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>

          <Col span={24}>
            <Form.Item name="teamHeadProfileId" label="Team Head">
              <Select placeholder="Select Team Head" optionFilterProp="label">
                {teamHeadList?.map((t) => (
                  <Option
                    key={t?.userProfileId}
                    value={t?.userProfileId}
                    label={formatEmployeeName(t?.userName)}
                  >
                    {formatEmployeeName(t?.userName)}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>

          <Col span={24}>
            <Form.Item name="zoneHeadProfileId" label="Zone Head">
              <Select placeholder="Select Zone Head" optionFilterProp="label">
                {zoneHeadList?.map((t) => (
                  <Option
                    key={t?.userProfileId}
                    value={t?.userProfileId}
                    label={formatEmployeeName(t?.userName)}
                  >
                    {formatEmployeeName(t?.userName)}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              name="roleInZone"
              label="Role in Selected Zone"
              rules={[{ required: true, message: "Select a role" }]}
            >
              <Select placeholder="Select Role">
                {Object.values(ROLES)?.map((role) => (
                  <Option key={role} value={role}>
                    {role}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="isActive" label="Employee Active">
              <Select placeholder="Select">
                <Option value={true}>Active</Option>
                <Option value={false}>Deactivate</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="empCode"
              label="Employee Code"
              rules={[{ required: true, message: "Employee code is required" }]}
            >
              <Input placeholder="Enter Employee Code" allowClear />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              name="isOnPayRoll"
              label="On Payroll"
              rules={[{ required: true }]}
            >
              <Select placeholder="Select">
                <Option value={true}>Yes</Option>
                <Option value={false}>No</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <div style={{ display: "flex", justifyContent: "end", marginTop: 20 }}>
          <Button style={{ marginRight: 10 }} onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            {initialValues
              ? "Save Changes"
              : employeeMode === "new"
                ? "Create & Add User"
                : "Add to Team"}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
