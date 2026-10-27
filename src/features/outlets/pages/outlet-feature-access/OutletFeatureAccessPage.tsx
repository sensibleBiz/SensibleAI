import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";
import { Button, Checkbox, Empty, Input, Select, Space, Switch, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CalendarClock,
  Check,
  Clock3,
  ListChecks,
  PackageCheck,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { RootState } from "@/app/store";
import {
  accessControlApi,
  OUTLET_FEATURE_ACCESS_UPDATED_EVENT,
  type OutletSummary,
} from "@/features/access-control";
import { useMessageApi } from "@/shared/hooks";
import {
  canManageOutletFeatureAccessFrom,
  PERMISSION_MASTER,
  ROUTES_PATHS,
} from "@/shared/lib/constants";
import { isRoleMatch, isSuperAdminRole } from "@/features/access-control";
import { usePermission } from "@/features/access-control";
import { DEFAULT_OUTLET_FEATURE_KEYS, getOutletFeatureSubmoduleParent, getOutletFeatureSubmodules, isOutletFeatureSubmoduleKey, LEADS_ONLY_FEATURE_KEYS, OUTLET_FEATURES, sortOutletFeatureKeys, type OutletFeatureConfig } from "../../utils/outletFeatures";
import { OUTLET_FEATURE_KEYS, type OutletFeatureKey } from "../../../../shared/lib/sidebarMenuConfig";

const { Text, Title } = Typography;

const adminRoleNames = ["SUPER_ADMIN", "ADMIN"];
type DateValue =
  | number
  | string
  | {
      seconds?: number;
      _seconds?: number;
      toMillis?: () => number;
    }
  | null
  | undefined;

type OutletFeatureSubmoduleRow = OutletFeatureConfig & {
  rowType: "submodule";
};

interface OutletFeatureSectionRow {
  key: string;
  rowType: "section";
  label: string;
  category: string;
  description: string;
  children: OutletFeatureSubmoduleRow[];
}

type OutletFeatureTableRow =
  | OutletFeatureSectionRow
  | OutletFeatureSubmoduleRow;

export default function OutletFeatureAccessPage() {
  const messageApi = useMessageApi();
  const currentOutletInfo = useSelector(
    (state: RootState) => state.appState.outletInfo
  );
  const { currentRole, hasPermission } = usePermission();
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedOutletFeatureKeys, setSelectedOutletFeatureKeys] = useState<
    OutletFeatureKey[]
  >([]);
  const [selectedOutletConfigured, setSelectedOutletConfigured] = useState(false);
  const [featureRevision, setFeatureRevision] = useState(0);
  const [loadingModuleSubscriptions, setLoadingModuleSubscriptions] =
    useState(false);
  const [outletUserCount, setOutletUserCount] = useState(0);
  const [loadingOutletUsers, setLoadingOutletUsers] = useState(false);
  const [selectedOutletId, setSelectedOutletId] = useState<string>();
  const [draftFeatureKeys, setDraftFeatureKeys] = useState<OutletFeatureKey[]>(
    DEFAULT_OUTLET_FEATURE_KEYS
  );
  const [searchText, setSearchText] = useState("");

  const canManageFeatureAccess =
    hasPermission(PERMISSION_MASTER.CRM_SETTINGS_EDIT) ||
    isSuperAdminRole(currentRole) ||
    adminRoleNames.some((role) => isRoleMatch(currentRole, role));
  const canOpenFeatureAccessPage =
    canManageFeatureAccess &&
    canManageOutletFeatureAccessFrom(currentOutletInfo?.id);

  useEffect(() => {
    const controller = new AbortController();
    if (!canOpenFeatureAccessPage) {
      setOutlets([]);
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    const loadOutlets = async () => {
      try {
        if (!currentOutletInfo?.id) return;
        setOutlets(
          await accessControlApi.listOutlets(
            currentOutletInfo.id,
            controller.signal,
          ),
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Error listening to outlets:", error);
        messageApi.error(
          error instanceof Error ? error.message : "Failed to load outlets",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadOutlets();
    return () => controller.abort();
  }, [canOpenFeatureAccessPage, currentOutletInfo?.id, messageApi]);

  useEffect(() => {
    if (selectedOutletId && outlets.some((outlet) => outlet.id === selectedOutletId)) {
      return;
    }

    const currentOutletId = currentOutletInfo?.id;
    const currentOutletAvailable =
      currentOutletId && outlets.some((outlet) => outlet.id === currentOutletId);

    setSelectedOutletId(
      currentOutletAvailable ? currentOutletId : outlets[0]?.id
    );
  }, [currentOutletInfo?.id, outlets, selectedOutletId]);

  const selectedOutlet = useMemo(
    () => outlets.find((outlet) => outlet.id === selectedOutletId),
    [outlets, selectedOutletId]
  );

  useEffect(() => {
    const controller = new AbortController();
    if (!canOpenFeatureAccessPage || !selectedOutlet?.id) {
      setSelectedOutletFeatureKeys([]);
      setSelectedOutletConfigured(false);
      setFeatureRevision(0);
      setOutletUserCount(0);
      setLoadingModuleSubscriptions(false);
      setLoadingOutletUsers(false);
      return () => controller.abort();
    }

    setLoadingModuleSubscriptions(true);
    setLoadingOutletUsers(true);
    const loadAccess = async () => {
      try {
        const access = await accessControlApi.getOutletFeatures(
          currentOutletInfo!.id,
          selectedOutlet.id,
          true,
          controller.signal,
        );
        setSelectedOutletFeatureKeys(
          sortOutletFeatureKeys(access.enabledFeatureKeys as OutletFeatureKey[]),
        );
        setSelectedOutletConfigured(access.isConfigured);
        setFeatureRevision(access.revision);
        setOutletUserCount(access.userCount ?? 0);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Error listening to module subscriptions:", error);
        messageApi.error(
          error instanceof Error
            ? error.message
            : "Failed to load module subscriptions",
        );
        setSelectedOutletFeatureKeys([]);
        setSelectedOutletConfigured(false);
        setOutletUserCount(0);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingModuleSubscriptions(false);
          setLoadingOutletUsers(false);
        }
      }
    };
    void loadAccess();
    return () => controller.abort();
  }, [canOpenFeatureAccessPage, currentOutletInfo, messageApi, selectedOutlet?.id]);

  useEffect(() => {
    setDraftFeatureKeys(selectedOutletFeatureKeys);
  }, [selectedOutletFeatureKeys, selectedOutlet?.id]);

  const filteredFeatures = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    if (!normalizedSearch) return OUTLET_FEATURES;

    return OUTLET_FEATURES.filter((feature) =>
      [feature.label, feature.category, feature.description]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [searchText]);

  const featureTableRows = useMemo<OutletFeatureSectionRow[]>(() => {
    const groupedFeatures = new Map<string, OutletFeatureConfig[]>();

    filteredFeatures.forEach((feature) => {
      const sectionFeatures = groupedFeatures.get(feature.category) ?? [];
      sectionFeatures.push(feature);
      groupedFeatures.set(feature.category, sectionFeatures);
    });

    return Array.from(groupedFeatures.entries()).map(
      ([category, features]) => ({
        key: `section:${category}`,
        rowType: "section",
        label: category,
        category,
        description: `${features.length} sidebar submodule${
          features.length === 1 ? "" : "s"
        }`,
        children: features.map((feature) => ({
          ...feature,
          rowType: "submodule",
        })),
      })
    );
  }, [filteredFeatures]);

  const draftFeatureKeySet = useMemo(
    () => new Set(draftFeatureKeys),
    [draftFeatureKeys]
  );

  const hasChanges =
    !sameFeatureKeys(draftFeatureKeys, selectedOutletFeatureKeys) ||
    Boolean(selectedOutlet && !selectedOutletConfigured);

  const enabledCount = draftFeatureKeys.length;
  const currentEnabledFeatureKeySet = useMemo(
    () => new Set(selectedOutletFeatureKeys),
    [selectedOutletFeatureKeys]
  );
  const currentEnabledFeatures = useMemo(
    () =>
      OUTLET_FEATURES.filter((feature) =>
        currentEnabledFeatureKeySet.has(feature.key)
      ),
    [currentEnabledFeatureKeySet]
  );

  if (!canOpenFeatureAccessPage) {
    return <Navigate to={ROUTES_PATHS.NO_ACCESS} replace />;
  }

  const handleToggleFeature = (featureKey: OutletFeatureKey, enabled: boolean) => {
    setDraftFeatureKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);

      const submoduleFeatureKeys = getOutletFeatureSubmodules(featureKey);
      if (submoduleFeatureKeys.length > 0) {
        submoduleFeatureKeys.forEach((submoduleFeatureKey) => {
          if (enabled) {
            nextKeys.add(submoduleFeatureKey);
          } else {
            nextKeys.delete(submoduleFeatureKey);
          }
        });
      }

      if (enabled) {
        nextKeys.add(featureKey);
      } else {
        nextKeys.delete(featureKey);
      }

      const parentFeatureKey = getOutletFeatureSubmoduleParent(featureKey);
      if (isOutletFeatureSubmoduleKey(featureKey) && parentFeatureKey) {
        const hasEnabledSubmodule = getOutletFeatureSubmodules(
          parentFeatureKey
        ).some(
          (submoduleFeatureKey) => nextKeys.has(submoduleFeatureKey)
        );

        if (hasEnabledSubmodule) {
          nextKeys.add(parentFeatureKey);
        } else {
          nextKeys.delete(parentFeatureKey);
        }
      }

      return sortOutletFeatureKeys(Array.from(nextKeys));
    });
  };

  const handleToggleFeatureSection = (
    features: OutletFeatureSubmoduleRow[],
    enabled: boolean
  ) => {
    setDraftFeatureKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);

      features.forEach((feature) => {
        if (enabled) {
          nextKeys.add(feature.key);
        } else {
          nextKeys.delete(feature.key);
        }
      });

      return sortOutletFeatureKeys(Array.from(nextKeys));
    });
  };

  const handleSave = async () => {
    if (!selectedOutlet?.id) {
      messageApi.error("Select an outlet first");
      return;
    }

    if (!canManageFeatureAccess) {
      messageApi.error("Only internal admin users can update outlet features");
      return;
    }

    const nextFeatureKeys = sortOutletFeatureKeys(draftFeatureKeys);

    setSaving(true);

    try {
      const access = await accessControlApi.updateOutletFeatures(
        currentOutletInfo!.id,
        selectedOutlet.id,
        nextFeatureKeys,
        featureRevision,
      );
      setSelectedOutletFeatureKeys(
        sortOutletFeatureKeys(access.enabledFeatureKeys as OutletFeatureKey[]),
      );
      setSelectedOutletConfigured(access.isConfigured);
      setFeatureRevision(access.revision);
      window.dispatchEvent(
        new CustomEvent(OUTLET_FEATURE_ACCESS_UPDATED_EVENT, {
          detail: { outletId: selectedOutlet.id },
        }),
      );
      messageApi.success("Outlet feature access updated");
    } catch (error) {
      console.error("Outlet feature access update failed:", error);
      messageApi.error(
        error instanceof Error
          ? error.message
          : "Failed to update outlet feature access",
      );
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<OutletFeatureTableRow> = [
    {
      title: "Sidebar module / submodule",
      dataIndex: "label",
      key: "label",
      render: (_, feature) => (
        <div className="min-w-0">
          <div
            className={
              feature.rowType === "section"
                ? "font-bold tracking-wide text-slate-950"
                : "font-semibold text-slate-950"
            }
          >
            {feature.label}
          </div>
          <div className="mt-1 max-w-xl text-sm text-slate-500">
            {feature.description}
          </div>
        </div>
      ),
    },
    {
      title: "Level",
      key: "level",
      width: 160,
      render: (_, feature) =>
        feature.rowType === "section" ? (
          <Tag color={getCategoryTagColor(feature.category)}>Module</Tag>
        ) : (
          <Tag color="blue">Submodule</Tag>
        ),
    },
    {
      title: "Access",
      key: "access",
      width: 130,
      align: "right",
      render: (_, feature) => {
        if (feature.rowType === "section") {
          const enabledSubmodules = feature.children.filter((submodule) =>
            draftFeatureKeySet.has(submodule.key)
          ).length;

          return (
            <Checkbox
              checked={enabledSubmodules === feature.children.length}
              indeterminate={
                enabledSubmodules > 0 &&
                enabledSubmodules < feature.children.length
              }
              onChange={(event) =>
                handleToggleFeatureSection(
                  feature.children,
                  event.target.checked
                )
              }
            >
              {enabledSubmodules}/{feature.children.length}
            </Checkbox>
          );
        }

        return (
          <Switch
            checked={draftFeatureKeySet.has(feature.key)}
            checkedChildren="On"
            unCheckedChildren="Off"
            onChange={(checked) => handleToggleFeature(feature.key, checked)}
          />
        );
      },
    },
  ];

  return (
    <main className="min-h-[calc(100vh-96px)] bg-slate-50 px-4 py-5 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
              <ShieldCheck size={15} />
              Internal admin
            </div>
            <Title level={2} style={{ margin: 0 }}>
              Outlet Feature Access
            </Title>
            <Text type="secondary">
              Enable only the CRM modules purchased by each outlet.
            </Text>
          </div>

          <Space wrap>
            <Button
              icon={<ListChecks size={16} />}
              onClick={() => setDraftFeatureKeys(DEFAULT_OUTLET_FEATURE_KEYS)}
            >
              Enable all
            </Button>
            <Button
              icon={<Check size={16} />}
              onClick={() => setDraftFeatureKeys(LEADS_ONLY_FEATURE_KEYS)}
            >
              Leads only
            </Button>
            <Button
              icon={<RotateCcw size={16} />}
              onClick={() => setDraftFeatureKeys([OUTLET_FEATURE_KEYS.DASHBOARD])}
            >
              Core only
            </Button>
            <Button
              type="primary"
              icon={<Save size={16} />}
              loading={saving}
              disabled={!selectedOutlet || loadingModuleSubscriptions || !hasChanges}
              onClick={handleSave}
            >
              Save changes
            </Button>
          </Space>
        </div>

        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,420px)_1fr_auto] lg:items-end">
            <label className="grid gap-1">
              <span className="text-sm font-semibold text-slate-700">Outlet</span>
              <Select
                showSearch
                loading={loading}
                value={selectedOutletId}
                placeholder="Select outlet"
                optionFilterProp="label"
                onChange={setSelectedOutletId}
                options={outlets.map((outlet) => ({
                  value: outlet.id,
                  label: [outlet.name, outlet.branch, outlet.city]
                    .filter(Boolean)
                    .join(" - "),
                }))}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-semibold text-slate-700">Search modules</span>
              <Input
                allowClear
                value={searchText}
                placeholder="Search by module or category"
                prefix={<Search size={16} />}
                onChange={(event) => setSearchText(event.target.value)}
              />
            </label>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Tag color={selectedOutletConfigured ? "green" : "gold"}>
                {selectedOutletConfigured ? "Configured" : "Default access"}
              </Tag>
              <Tag color="blue">
                {enabledCount}/{OUTLET_FEATURES.length} enabled
              </Tag>
            </div>
          </div>

          {selectedOutlet && (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{selectedOutlet.name}</span>
              {selectedOutlet.branch ? ` - ${selectedOutlet.branch}` : ""}
              {selectedOutlet.city ? ` - ${selectedOutlet.city}` : ""}
            </div>
          )}
        </section>

        <section className="mb-4 grid gap-3 lg:grid-cols-4">
          <SummaryPanel
            icon={<UsersRound size={18} />}
            label="Users"
            loading={loadingOutletUsers}
            value={`${outletUserCount}`}
            helper="Assigned to this outlet"
          />
          <SummaryPanel
            icon={<Clock3 size={18} />}
            label="Renewal"
            value={getRenewalDaysLabel(selectedOutlet?.renewalDate)}
            helper={formatDateValue(selectedOutlet?.renewalDate)}
          />
          <SummaryPanel
            icon={<CalendarClock size={18} />}
            label="Created"
            value={formatDateValue(selectedOutlet?.createdDate)}
            helper="Outlet created date"
          />
          <SummaryPanel
            icon={<PackageCheck size={18} />}
            label="Features"
            value={`${enabledCount}/${OUTLET_FEATURES.length}`}
            helper="Total features enabled"
          />
        </section>

        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Current Enabled Features
              </h2>
              <p className="text-sm text-slate-500">
                These are the modules this outlet can use after login.
              </p>
            </div>
            <Tag color={selectedOutletConfigured ? "green" : "gold"}>
              {selectedOutletConfigured ? "Saved setup" : "Default access"}
            </Tag>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentEnabledFeatures.length > 0 ? (
              currentEnabledFeatures.map((feature) => (
                <Tag key={feature.key} color={getCategoryTagColor(feature.category)}>
                  {feature.label}
                </Tag>
              ))
            ) : (
              <span className="text-sm text-slate-500">No features enabled</span>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <Table
            rowKey="key"
            loading={loading || loadingModuleSubscriptions}
            dataSource={featureTableRows}
            columns={columns}
            defaultExpandAllRows
            pagination={false}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    outlets.length === 0
                      ? "No outlets available"
                      : "No modules match your search"
                  }
                />
              ),
            }}
            scroll={{ x: 720 }}
          />
        </section>
      </div>
    </main>
  );
}

function SummaryPanel({
  helper,
  icon,
  label,
  loading,
  value,
}: {
  helper: string;
  icon: ReactNode;
  label: string;
  loading?: boolean;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-500">{label}</div>
          <div className="mt-1 truncate text-2xl font-bold text-slate-950">
            {loading ? "Loading..." : value}
          </div>
          <div className="mt-1 truncate text-sm text-slate-500">{helper}</div>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

function formatDateValue(value?: DateValue) {
  const timestamp = parseDateMs(value);

  if (!timestamp) return "-";

  return new Date(timestamp).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getRenewalDaysLabel(value?: DateValue) {
  const timestamp = parseDateMs(value);

  if (!timestamp) return "-";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Math.ceil((timestamp - today.getTime()) / (24 * 60 * 60 * 1000));

  if (days > 0) return `${days} days left`;
  if (days === 0) return "Due today";

  return `${Math.abs(days)} days overdue`;
}

function parseDateMs(value?: DateValue) {
  if (!value) return undefined;

  if (typeof value === "object") {
    if (typeof value.toMillis === "function") {
      const timestamp = value.toMillis();
      return Number.isFinite(timestamp) ? timestamp : undefined;
    }

    const seconds = value.seconds ?? value._seconds;
    return Number.isFinite(seconds) ? Number(seconds) * 1000 : undefined;
  }

  const numericValue =
    typeof value === "string" && value.trim() && !Number.isNaN(Number(value))
      ? Number(value)
      : value;
  const timestamp =
    typeof numericValue === "number" && numericValue < 946684800000
      ? numericValue * 1000
      : numericValue;
  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

function sameFeatureKeys(
  left: OutletFeatureKey[],
  right: OutletFeatureKey[]
) {
  if (left.length !== right.length) return false;

  const leftSorted = sortOutletFeatureKeys(left);
  const rightSorted = sortOutletFeatureKeys(right);

  return leftSorted.every((key, index) => key === rightSorted[index]);
}

function getCategoryTagColor(category: string) {
  switch (category) {
    case "HOME":
    case "Core":
      return "blue";
    case "SALES":
    case "Sales":
      return "green";
    case "OPERATIONS":
    case "HR":
      return "purple";
    case "AI INTELLIGENCE":
      return "gold";
    case "ENGAGEMENT":
      return "geekblue";
    case "ANALYTICS":
      return "cyan";
    case "SETTINGS":
      return "volcano";
    case "Inventory":
      return "cyan";
    case "Communication":
      return "geekblue";
    case "Support":
      return "magenta";
    case "Administration":
      return "volcano";
    default:
      return "default";
  }
}
