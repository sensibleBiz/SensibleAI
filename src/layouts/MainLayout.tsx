import React, { Suspense, useEffect, useMemo, useState } from "react";
import {
  DownOutlined,
  HolderOutlined,
  LogoutOutlined,
  MailOutlined,
  MoonOutlined,
  PhoneOutlined,
  SunOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import {
  Alert,
  Avatar,
  Button,
  Divider,
  Dropdown,
  Layout,
  Menu,
  Space,
  Tooltip,
  Typography,
} from "antd";
import { Outlet as RouterOutlet, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { logout, updateSidebarMenuOrder } from "@/features/auth";
import type { RootState } from "@/app/store";
import {
  ROUTES_PATHS,
  isInternalAdminOutlet,
} from "@/shared/lib/constants";
import { clearOutletInfo, clearteamTreeData, setBusinessConfiguration, setOutletInfo } from "@/app/store/appStateSlice";
import { businessConfigurationApi } from "@/features/onboarding/api/businessConfigurationApi";
import { usePermission } from "@/features/access-control";
import { outletApi, useOutletFeatureAccess } from "@/features/outlets";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";
import { formatRoleLabel } from "@/features/access-control";
import { useThemeMode } from "@/shared/hooks";
import SpinLoader from "@/shared/components/SpinLoader";
import { CrmAssistant } from "@/features/assistant/components/CrmAssistant";
import { AiModeScreen } from "@/features/assistant/components/AiModeScreen";
import SemanticSearchBar from "@/features/leads/components/SemanticSearchBar";
import {
  type OutletFeatureKey,
} from "@/features/outlets";
import {
  SIDEBAR_MENU_OPTIONS,
  type SidebarMenuOption,
} from "@/shared/lib/sidebarMenuConfig";
import { PortalSwitcher } from "@/shared/components/PortalSwitcher";
import { Plus, Sparkles, Zap } from "lucide-react";
import { billingApi, type WalletRecord, CreditTopUpModal } from "@/features/billing";
const { Text } = Typography;
const { Header, Content, Sider } = Layout;

type MenuItem = Required<MenuProps>["items"][number];

type DropPosition = "before" | "after";

const SIDEBAR_ORDER_STORAGE_PREFIX = "crm-sidebar-menu-order";

type PermissionMenuItem = MenuItem & {
  children?: MenuItem[];
  label?: React.ReactNode;
  requiredPermissions?: readonly string[];
  fallbackRoles?: readonly string[];
  featureBypassRoles?: readonly string[];
  featureKey?: OutletFeatureKey;
  internalOnly?: boolean;
  allowedOutletIds?: readonly string[];
  verticals?: readonly string[];
  salesFootprints?: readonly string[];
};

interface HeaderBarProps {
  user?: { name: string; email?: string; role?: string; phone_number?: string };
  handleLogout: () => void;
  aiMode: boolean;
  onToggleAiMode: () => void;
  showAiToggle: boolean;
  outletId?: string;
  availableCredits: number;
  creditHealth: "green" | "yellow" | "red";
  onOpenTopUpModal: () => void;
}

type DraggableMenuLabelProps = {
  children: React.ReactNode;
  disabled?: boolean;
  dragging?: boolean;
  dropPosition?: DropPosition;
  expandable?: boolean;
  menuKey: string;
  onDragEnd: () => void;
  onDragStart: (menuKey: string) => void;
  onDragTargetChange: (menuKey: string, position: DropPosition) => void;
  onDrop: (
    menuKey: string,
    position: DropPosition,
    draggedMenuKey?: string
  ) => void;
};

function getSidebarDropTarget(
  clientX: number,
  clientY: number
): { dropKey: string; position: DropPosition } | undefined {
  if (typeof document === "undefined") return undefined;
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return undefined;

  // 1. Direct match on label with data-sidebar-menu-key
  const directTarget = el.closest<HTMLElement>("[data-sidebar-menu-key]");
  if (directTarget?.dataset.sidebarMenuKey) {
    const rect = directTarget.getBoundingClientRect();
    return {
      dropKey: directTarget.dataset.sidebarMenuKey,
      position: (clientY > rect.top + rect.height / 2 ? "after" : "before") as DropPosition,
    };
  }

  // Expanded submenu children sit between the top-level section headers. Treat
  // the whole submenu as a target so a drop still works over one of its links.
  const submenuContainer = el.closest<HTMLElement>(".ant-menu-submenu");
  if (submenuContainer) {
    const labelEl = submenuContainer.querySelector<HTMLElement>(
      ":scope > .ant-menu-submenu-title [data-sidebar-menu-key]"
    );
    if (labelEl?.dataset.sidebarMenuKey) {
      const rect = submenuContainer.getBoundingClientRect();
      return {
        dropKey: labelEl.dataset.sidebarMenuKey,
        position: clientY > rect.top + rect.height / 2 ? "after" : "before",
      };
    }
  }

  const menuItem = el.closest<HTMLElement>(".ant-menu-item");
  const labelEl = menuItem?.querySelector<HTMLElement>(
    "[data-sidebar-menu-key]"
  );
  if (menuItem && labelEl?.dataset.sidebarMenuKey) {
    const rect = menuItem.getBoundingClientRect();
    return {
      dropKey: labelEl.dataset.sidebarMenuKey,
      position: clientY > rect.top + rect.height / 2 ? "after" : "before",
    };
  }

  return undefined;
}

function DraggableMenuLabel({
  children,
  disabled = false,
  dragging = false,
  dropPosition,
  expandable = false,
  menuKey,
  onDragEnd,
  onDragStart,
  onDragTargetChange,
  onDrop,
}: DraggableMenuLabelProps) {
  return (
    <div
      draggable={!disabled}
      className={`sidebar-draggable-label${dragging ? " is-dragging" : ""}${
        dropPosition ? ` is-drop-${dropPosition}` : ""
      }`}
      data-sidebar-menu-key={menuKey}
      style={{
        cursor: disabled ? "inherit" : "grab",
        userSelect: "none",
      }}
      onDragStart={(event) => {
        if (disabled) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", menuKey);
        onDragStart(menuKey);
      }}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";

        const target = getSidebarDropTarget(event.clientX, event.clientY);
        if (target) {
          onDragTargetChange(target.dropKey, target.position);
        } else {
          const rect = event.currentTarget.getBoundingClientRect();
          const position =
            event.clientY > rect.top + rect.height / 2 ? "after" : "before";
          onDragTargetChange(menuKey, position);
        }
      }}
      onDrop={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.stopPropagation();

        const target = getSidebarDropTarget(event.clientX, event.clientY);
        const draggedKey =
          event.dataTransfer.getData("text/plain") || menuKey;
        if (target) {
          onDrop(target.dropKey, target.position, draggedKey);
        } else {
          const rect = event.currentTarget.getBoundingClientRect();
          const position =
            event.clientY > rect.top + rect.height / 2 ? "after" : "before";
          onDrop(menuKey, position, draggedKey);
        }
      }}
      onDragEnd={onDragEnd}
    >
      <span className="sidebar-draggable-label__content">{children}</span>
      {!disabled && (
        <span
          aria-label="Drag menu section to reorder sidebar"
          className="sidebar-drag-handle"
          onClick={(event) => {
            // Submenu title clicks are handled by Ant Design. Let section-handle
            // clicks bubble so this icon also expands/collapses the dropdown.
            if (!expandable) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          title={expandable ? "Click to expand or collapse; drag to reorder" : "Drag to reorder sidebar"}
        >
          <HolderOutlined aria-hidden="true" />
        </span>
      )}
    </div>
  );
}

function getMenuKey(item: MenuItem) {
  return String((item as PermissionMenuItem)?.key || "");
}

function getMenuKeys(menuItems: MenuItem[]) {
  return menuItems.map(getMenuKey).filter(Boolean);
}

function mergeMenuOrder(order: string[] | undefined, menuItems: MenuItem[]) {
  const validKeys = getMenuKeys(menuItems);
  const validKeySet = new Set(validKeys);
  const orderedKeys = (order || []).filter((key) => validKeySet.has(key));
  const missingKeys = validKeys.filter((key) => !orderedKeys.includes(key));

  return [...orderedKeys, ...missingKeys];
}

function orderMenuItems(menuItems: MenuItem[], order: string[]) {
  const normalizedOrder = mergeMenuOrder(order, menuItems);
  const orderIndex = new Map(
    normalizedOrder.map((key, index) => [key, index])
  );

  return [...menuItems].sort(
    (left, right) =>
      (orderIndex.get(getMenuKey(left)) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndex.get(getMenuKey(right)) ?? Number.MAX_SAFE_INTEGER)
  );
}

function moveMenuKey(
  order: string[],
  draggedKey: string,
  dropKey: string,
  position: DropPosition
) {
  if (!draggedKey || !dropKey || draggedKey === dropKey) return order;

  const nextOrder = order.filter((key) => key !== draggedKey);
  const dropIndex = nextOrder.indexOf(dropKey);
  if (dropIndex < 0) return order;

  nextOrder.splice(position === "after" ? dropIndex + 1 : dropIndex, 0, draggedKey);
  return nextOrder;
}

function safeStoragePart(value?: string) {
  return encodeURIComponent(String(value || "default").trim() || "default");
}

function safePreferenceKey(value?: string) {
  return String(value || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getSidebarOrderStorageKey(userId?: string, outletId?: string) {
  return [
    SIDEBAR_ORDER_STORAGE_PREFIX,
    safeStoragePart(userId),
    safeStoragePart(outletId),
  ].join(":");
}

function readStoredSidebarOrder(storageKey: string) {
  if (typeof window === "undefined") return undefined;

  try {
    const rawOrder = window.localStorage.getItem(storageKey);
    const parsedOrder = rawOrder ? JSON.parse(rawOrder) : undefined;

    return Array.isArray(parsedOrder)
      ? parsedOrder.filter((key) => typeof key === "string")
      : undefined;
  } catch {
    return undefined;
  }
}

function getNameInitials(name?: string, fallback = "U") {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return fallback;
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();

  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function saveStoredSidebarOrder(storageKey: string, order: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(order));
  } catch {
    // Local persistence is a fallback, so storage failures should not block use.
  }
}

function addDraggableMenuLabels({
  collapsed,
  draggedMenuKey,
  dragTarget,
  menuItems,
  onDragEnd,
  onDragStart,
  onDragTargetChange,
  onDrop,
}: {
  collapsed: boolean;
  draggedMenuKey: string | null;
  dragTarget: { menuKey: string; position: DropPosition } | null;
  menuItems: MenuItem[];
  onDragEnd: () => void;
  onDragStart: (menuKey: string) => void;
  onDragTargetChange: (menuKey: string, position: DropPosition) => void;
  onDrop: (
    menuKey: string,
    position: DropPosition,
    draggedMenuKey?: string
  ) => void;
}) {
  return menuItems.map((item) => {
    const menuItem = item as PermissionMenuItem;
    const menuKey = getMenuKey(item);

    return {
      ...menuItem,
      label: (
        <DraggableMenuLabel
          disabled={collapsed}
          dragging={draggedMenuKey === menuKey}
          expandable={
            Array.isArray(menuItem.children) && menuItem.children.length > 0
          }
          dropPosition={
            dragTarget?.menuKey === menuKey ? dragTarget.position : undefined
          }
          menuKey={menuKey}
          onDragEnd={onDragEnd}
          onDragStart={onDragStart}
          onDragTargetChange={onDragTargetChange}
          onDrop={onDrop}
        >
          {menuItem.label}
        </DraggableMenuLabel>
      ),
    } as MenuItem;
  });
}


function getComingSoonItem(label: string, key: string): MenuItem {
  return {
    key,
    disabled: true,
    label: <span title={`${label} is coming soon`}>{label}</span>,
  } as MenuItem;
}

function getSectionIcon(emoji: string) {
  return (
    <span aria-hidden="true" className="sidebar-section-icon">
      {emoji}
    </span>
  );
}

const buildConfiguredMenuItems = (
  options: readonly SidebarMenuOption[]
): MenuItem[] =>
  options.map((option) => {
    if (option.comingSoon) {
      return getComingSoonItem(option.label, option.menuKey);
    }

    return {
      key: option.menuKey,
      label: option.label,
      icon: option.sectionIcon
        ? getSectionIcon(option.sectionIcon)
        : undefined,
      children: option.children
        ? buildConfiguredMenuItems(option.children)
        : undefined,
      requiredPermissions: option.requiredPermissions,
      fallbackRoles: option.fallbackRoles,
      featureBypassRoles: option.featureBypassRoles,
      featureKey: option.featureKey,
      internalOnly: option.internalOnly,
      allowedOutletIds: option.allowedOutletIds,
      verticals: option.verticals,
      salesFootprints: option.salesFootprints,
    } as PermissionMenuItem;
  });

const items = buildConfiguredMenuItems(SIDEBAR_MENU_OPTIONS);

const SIDEBAR_SECTION_KEYS = [
  "sub_home",
  "sub_sales",
  "sub_ai_intelligence",
  "sub_engagement",
  "sub_analytics",
  "sub_operations",
  "sub_settings",
];



const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [draggedMenuKey, setDraggedMenuKey] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<{
    menuKey: string;
    position: DropPosition;
  } | null>(null);
  const [menuOrder, setMenuOrder] = useState<string[]>(() =>
    getMenuKeys(items)
  );
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const location = useLocation();
  const outletInfo = useSelector(
    (state: RootState) => state?.appState?.outletInfo
  );
  const user = useSelector((state: RootState) => state?.auth.user);
  const businessConfiguration = useSelector(
    (state: RootState) => state.appState.businessConfiguration?.configuration
  );
  const postgresAccess = useSelector(
    (state: RootState) => state?.auth.postgresAccess
  );
  const permissionRefreshError = useSelector(
    (state: RootState) => state.auth.permissionRefreshError
  );
  const { currentRole, hasAnyPermission, hasAnyRole } = usePermission();
  const { hasOutletFeature } = useOutletFeatureAccess();
  const { isDark } = useThemeMode();
  const profileUser = user
    ? {
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
      }
    : postgresAccess?.user
      ? {
          name: postgresAccess.user.displayName,
          email: postgresAccess.user.email ?? undefined,
          phone_number: postgresAccess.user.phone ?? undefined,
        }
      : undefined;
  const userId = user?.id || user?.uid || postgresAccess?.user.id || "";
  const outletId = outletInfo?.id || "";
  useEffect(() => {
    if (!outletId) return;
    const controller = new AbortController();
    void businessConfigurationApi.get(outletId, controller.signal).then((configuration) => {
      if (!controller.signal.aborted) dispatch(setBusinessConfiguration({ outletId, configuration }));
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) console.error("Unable to load workspace configuration", error);
    });
    return () => controller.abort();
  }, [dispatch, outletId]);

  const [wallet, setWallet] = useState<WalletRecord | null>(null);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);

  useEffect(() => {
    if (!outletId) return;
    const controller = new AbortController();
    void billingApi.getWallet(outletId, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted && res?.wallet) {
          setWallet(res.wallet);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) console.warn("Wallet status unavailable", err);
      });
    return () => controller.abort();
  }, [outletId]);

  const availableCredits = useMemo(() => {
    if (wallet?.availableCredits) return Number(wallet.availableCredits);
    return 45000;
  }, [wallet]);

  const creditHealth = useMemo<"green" | "yellow" | "red">(() => {
    if (availableCredits > 5000) return "green";
    if (availableCredits >= 1000) return "yellow";
    return "red";
  }, [availableCredits]);

  const outletPreferenceKey = safePreferenceKey(outletId);
  const sidebarOrderStorageKey = useMemo(
    () => getSidebarOrderStorageKey(userId, outletId),
    [outletId, userId]
  );
  const savedProfileMenuOrder =
    user?.sidebarMenuOrderByOutlet?.[outletPreferenceKey];
  const hasChildren = (
    item: MenuItem
  ): item is PermissionMenuItem & { children: MenuItem[] } =>
    Array.isArray((item as PermissionMenuItem).children);

  useEffect(() => {
    const storedOrder =
      readStoredSidebarOrder(sidebarOrderStorageKey) || savedProfileMenuOrder;

    setMenuOrder(mergeMenuOrder(storedOrder, items));
    setDraggedMenuKey(null);
    setDragTarget(null);
  }, [
    outletPreferenceKey,
    savedProfileMenuOrder,
    sidebarOrderStorageKey,
  ]);

  const filterMenu = (menu: MenuItem[]): MenuItem[] => {
    return menu
      .filter((item) => {
        const menuItem = item as PermissionMenuItem;
        if (menuItem.internalOnly && !isInternalAdminOutlet(outletId)) {
          return false;
        }
        if (
          menuItem.allowedOutletIds?.length &&
          !menuItem.allowedOutletIds.includes(outletId)
        ) {
          return false;
        }
        if (
          menuItem.verticals?.length &&
          (!businessConfiguration?.vertical ||
            !menuItem.verticals.includes(businessConfiguration.vertical))
        ) {
          return false;
        }
        if (menuItem.salesFootprints?.length) {
          const configuredFootprint = businessConfiguration?.settings?.salesFootprint;
          const effectiveFootprint =
            typeof configuredFootprint === "string"
              ? configuredFootprint
              : businessConfiguration?.vertical === "exports"
                ? "exports"
                : undefined;
          if (!effectiveFootprint || !menuItem.salesFootprints.includes(effectiveFootprint)) {
            return false;
          }
        }

        const requiredPerms = [...(menuItem.requiredPermissions ?? [])];
        const fallbackRoles = [...(menuItem.fallbackRoles ?? [])];
        const featureBypassRoles = [...(menuItem.featureBypassRoles ?? [])];
        const hasFeatureBypassRole =
          featureBypassRoles.length > 0 && hasAnyRole(featureBypassRoles);

        if (!hasFeatureBypassRole && !hasOutletFeature(menuItem.featureKey)) {
          return false;
        }

        if (!requiredPerms || requiredPerms.length === 0) {
          return fallbackRoles.length === 0 || hasAnyRole(fallbackRoles);
        }

        return hasAnyPermission(requiredPerms) || hasAnyRole(fallbackRoles);
      })
      .map((item) => {
        const menuItem = { ...item } as PermissionMenuItem;
        delete menuItem.featureKey;
        delete menuItem.requiredPermissions;
        delete menuItem.fallbackRoles;
        delete menuItem.featureBypassRoles;
        delete menuItem.internalOnly;
        delete menuItem.allowedOutletIds;
        delete menuItem.verticals;
        delete menuItem.salesFootprints;

        if (hasChildren(item)) {
          const filteredChildren = filterMenu(item.children);
          return { ...menuItem, children: filteredChildren };
        }
        return menuItem;
      })
      .filter((item) => !(hasChildren(item) && item.children.length === 0)); // remove empty submenu
  };

  const handleMenuClick: MenuProps["onClick"] = (e) => {
    // Only navigate if key is a path (not a submenu key)
    if (!e.key.includes("sub")) {
      // Opening setup from the menu is always a reconfigure; without the flag
      // the wizard redirects already-configured workspaces to the dashboard.
      navigate(e.key === "/setup" ? "/setup?reconfigure=true" : e.key);
    }
  };

  const handleLogout = () => {
    dispatch(clearOutletInfo());
    dispatch(clearteamTreeData());
    dispatch(logout());
    navigate(ROUTES_PATHS.LOGIN);
  };

  const handleSidebarMenuDrop = (
    dropKey: string,
    position: DropPosition,
    draggedMenuKeyOverride?: string
  ) => {
    const activeDraggedMenuKey = draggedMenuKeyOverride || draggedMenuKey;
    if (!activeDraggedMenuKey) return;

    const currentOrder = mergeMenuOrder(menuOrder, items);
    const nextOrder = moveMenuKey(
      currentOrder,
      activeDraggedMenuKey,
      dropKey,
      position
    );

    setDraggedMenuKey(null);
    setDragTarget(null);

    if (nextOrder.join("|") === currentOrder.join("|")) {
      return;
    }

    setMenuOrder(nextOrder);
    saveStoredSidebarOrder(sidebarOrderStorageKey, nextOrder);
    dispatch(updateSidebarMenuOrder({ outletPreferenceKey, order: nextOrder }));
  };

  const HeaderBar: React.FC<HeaderBarProps> = ({
    user,
    handleLogout,
    aiMode,
    onToggleAiMode,
    showAiToggle,
    outletId: headerOutletId,
    availableCredits,
    creditHealth,
    onOpenTopUpModal,
  }) => {
    const { isDark, toggleTheme } = useThemeMode();
    const menuItems: MenuProps["items"] = [
      {
        key: "profile",
        label: (
          <div
            style={{
              width: 260,
              padding: "16px",
              // border:"1px solid black"
            }}
          // bodyStyle={{ padding: "16px" }}
          >
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {/* Profile Header */}
              <div style={{ textAlign: "center" }}>
                <Avatar
                  size={56}
                  style={{
                    backgroundColor: "#1677ff",
                    fontSize: "22px",
                    fontWeight: 600,
                    marginBottom: "8px",
                  }}
                >
                  {getNameInitials(user?.name)}
                </Avatar>
                <div>
                  <Typography.Text
                    strong
                    style={{
                      fontSize: "14px",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    {formatEmployeeName(user?.name, "User")}
                  </Typography.Text>
                  {currentRole && (
                    <Typography.Text
                      type="secondary"
                      className="app-profile-role"
                      style={{
                        fontSize: "11px",
                        display: "inline-block",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontWeight: 500,
                      }}
                    >
                      {formatRoleLabel(currentRole)}
                    </Typography.Text>
                  )}
                </div>
              </div>

              <Divider style={{ margin: "4px 0" }} />

              {/* User Information */}
              <Space
                direction="vertical"
                size={6}
                style={{ width: "100%" }}
              >
                {user?.email && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "6px",
                      borderRadius: "4px",
                    }}
                    className="app-profile-meta-row"
                  >
                    <MailOutlined
                      style={{ color: "#1677ff", fontSize: "14px" }}
                    />
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: "12px", flex: 1 }}
                      ellipsis
                    >
                      {user.email}
                    </Typography.Text>
                  </div>
                )}
                {user?.phone_number && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "6px",
                      borderRadius: "4px",
                    }}
                    className="app-profile-meta-row"
                  >
                    <PhoneOutlined
                      style={{ color: "#1677ff", fontSize: "14px" }}
                    />
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: "12px" }}
                    >
                      {user.phone_number}
                    </Typography.Text>
                  </div>
                )}
              </Space>

              <Divider style={{ margin: "4px 0" }} />

              {/* Action Buttons */}
              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                {/* <Button
                  type="default"
                  icon={<SettingOutlined />}
                  block
                  style={{
                    height: "36px",
                    borderRadius: "4px",
                    fontWeight: 500,
                    borderColor: "#d9d9d9",
                    fontSize: "13px",
                  }}
                >
                  Account Settings
                </Button> */}
                {/* <Button
                  type="primary"
                  icon={<UserOutlined />}
                  block
                  style={{
                    height: "36px",
                    borderRadius: "4px",
                    fontWeight: 500,
                    backgroundColor: "#1677ff",
                    borderColor: "#1677ff",
                    fontSize: "13px",
                  }}
                >
                  View Profile
                </Button> */}
                <Button
                  danger
                  icon={<LogoutOutlined />}
                  onClick={handleLogout}
                  block
                  style={{
                    height: "36px",
                    borderRadius: "4px",
                    fontWeight: 500,
                    fontSize: "13px",
                  }}
                >
                  Sign Out
                </Button>
              </Space>
            </Space>
          </div>
        ),
      },
    ];


    return (
      <Header
        className="app-header"
        style={{ justifyContent: "space-between" }}
      >
        <div className="app-header-left">
          <button
            type="button"
            className="app-header-brand"
            onClick={() => navigate(ROUTES_PATHS.DASHBOARD)}
            title="Sensible Connect"
          >
            <span className="app-header-logo-window">
              <img src="/images/logo1.jpeg" alt="Sensible Connect" />
            </span>
          </button>
          <PortalSwitcher />

          {headerOutletId && showAiToggle && (
            <div className="app-header-search">
              <SemanticSearchBar outletId={headerOutletId} />
            </div>
          )}
        </div>

        <div className="app-header-actions">
          {headerOutletId && (
            <button
              type="button"
              className="app-header-credits-pill"
              onClick={onOpenTopUpModal}
              title="Sensible Credits • ₹0 Platform Fee • Click to Top Up or manage Auto Credit"
            >
              <Zap size={13} className="credits-bolt-icon" />
              <span className="credits-number">{availableCredits.toLocaleString()}</span>
              <span className="credits-label">Cr</span>
              <span className={`credits-health-dot ${creditHealth}`} />
            </button>
          )}

          {showAiToggle && (
            <Tooltip title={aiMode ? "Switch back to manual CRM" : "Switch to full Sensible AI assistant mode"}>
              <button
                type="button"
                className={`app-header-ai-mode-btn ${aiMode ? "active" : ""}`}
                onClick={onToggleAiMode}
                aria-label={aiMode ? "Exit AI mode" : "Enter AI mode"}
              >
                <Sparkles size={13} className="ai-mode-sparkle" />
                <span>{aiMode ? "Exit AI Mode" : "AI Mode"}</span>
              </button>
            </Tooltip>
          )}

          <Tooltip title={isDark ? "Switch to light theme" : "Switch to dark theme"}>
            <Button
              type="text"
              className="app-theme-toggle"
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
              icon={isDark ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
            />
          </Tooltip>
        <Dropdown
          menu={{ items: menuItems }}
          placement="bottomRight"
          trigger={["click"]}
        >
          <div
            className="app-user-trigger"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              cursor: "pointer",
              padding: "6px 12px",
              borderRadius: "8px",
              transition: "all 0.2s ease",
            }}
          >
            <Avatar
              style={{
                backgroundColor: "#1677ff",
                color: "#fff",
                fontWeight: 600,
              }}
            >
              {getNameInitials(user?.name)}
            </Avatar>
            <div
              className="app-user-copy"
              style={{ display: "flex", flexDirection: "column" }}
            >
              <Text strong style={{ fontSize: "14px", lineHeight: 1.2 }}>
                {formatEmployeeName(user?.name, "User")}
              </Text>
              {currentRole && (
                <Text
                  type="secondary"
                  style={{ fontSize: "11px", lineHeight: 1.2 }}
                >
                  {formatRoleLabel(currentRole)}
                </Text>
              )}
            </div>
            <DownOutlined
              className="app-user-chevron"
              style={{ fontSize: "12px", color: "#8c8c8c", marginLeft: "4px" }}
            />
          </div>
        </Dropdown>
        </div>
      </Header>
    );
  };
  const orderedMenu = orderMenuItems(items, menuOrder);
  const finalMenu = filterMenu(orderedMenu);
  const draggableMenu = addDraggableMenuLabels({
    collapsed,
    draggedMenuKey,
    dragTarget,
    menuItems: finalMenu,
    onDragEnd: () => {
      setDraggedMenuKey(null);
      setDragTarget(null);
    },
    onDragStart: (menuKey) => {
      setDraggedMenuKey(menuKey);
      setDragTarget(null);
    },
    onDragTargetChange: (menuKey, position) =>
      setDragTarget({ menuKey, position }),
    onDrop: handleSidebarMenuDrop,
  });
  const outletName = outletInfo?.name || "Business Profile";
  const outletSubtitle =
    [outletInfo?.businessName, outletInfo?.branch || outletInfo?.city]
      .filter(Boolean)
      .join(" • ") || "Business account";
  const accessibleOutlets = Array.from(
    new Map((postgresAccess?.outlets ?? []).map((outlet) => [outlet.id, outlet])).values()
  );
  const businessGroups = Array.from(
    accessibleOutlets.reduce((groups, outlet) => {
      const key = outlet.businessId || "business";
      const group = groups.get(key) ?? {
        name: outlet.businessName || "Business",
        outlets: [] as typeof accessibleOutlets,
      };
      group.outlets.push(outlet);
      groups.set(key, group);
      return groups;
    }, new Map<string, { name: string; outlets: typeof accessibleOutlets }>()).entries()
  );
  const outletSwitcherItems: MenuProps["items"] = [
    ...businessGroups.map(([businessId, group]) => ({
      key: `business:${businessId}`,
      type: "group" as const,
      label: group.name,
      children: group.outlets.map((outlet) => ({
        key: `outlet:${outlet.id}`,
        label: (
          <div style={{ minWidth: 190 }}>
            <Text strong={outlet.id === outletId}>{outlet.name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>{outlet.roleName}</Text>
          </div>
        ),
      })),
    })),
    { type: "divider" as const },
    { key: "manage-profile", label: "Manage business profile" },
  ];
  const handleOutletContextClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "manage-profile") {
      navigate(ROUTES_PATHS.OUTLET_DETAILS);
      return;
    }
    if (!key.startsWith("outlet:")) return;
    const nextOutletId = key.slice("outlet:".length);
    if (!nextOutletId || nextOutletId === outletId) return;
    void outletApi.get(nextOutletId)
      .then((result) => {
        dispatch(setOutletInfo(result.outlet));
        navigate(ROUTES_PATHS.DASHBOARD);
      })
      .catch((error: unknown) => {
        console.error("Unable to switch business outlet", error);
      });
  };
  const siderWidth = collapsed ? 80 : 228;

  return (
    <Layout className="app-shell" style={{ minHeight: "100vh" }}>
      {/* FIXED SIDEBAR */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={(value) => setCollapsed(value)}
        theme={isDark ? "dark" : "light"}
        width={228}
        collapsedWidth={80}
        className="app-sidebar sidebar-shell"
        style={{ overflow: "hidden" }}
      >
        <div className={`sidebar-inner${collapsed ? " sidebar-inner--collapsed" : ""}`}>

          <Dropdown
            menu={{ items: outletSwitcherItems, onClick: handleOutletContextClick }}
            placement="bottomLeft"
            trigger={["click"]}
          >
            <button
              type="button"
              className="sidebar-outlet-profile"
              disabled={!outletInfo}
              title={outletInfo ? `Switch business or outlet from ${outletName}` : "Business profile"}
            >
              <span className="sidebar-outlet-avatar">
                {getNameInitials(outletName, "O")}
              </span>
              {!collapsed && (
                <span className="sidebar-outlet-copy">
                  <span className="sidebar-outlet-eyebrow">Business / Outlet</span>
                  <strong>{outletName}</strong>
                  <small>{outletSubtitle}</small>
                </span>
              )}
              {!collapsed && <DownOutlined style={{ marginLeft: "auto", fontSize: 10 }} />}
            </button>
          </Dropdown>

          <div
            className="sidebar-navigation sidebar-scroll-area"
            onDragOver={(event) => {
              if (!draggedMenuKey) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              const target = getSidebarDropTarget(event.clientX, event.clientY);
              if (target && target.dropKey !== draggedMenuKey) {
                setDragTarget({
                  menuKey: target.dropKey,
                  position: target.position,
                });
              }
            }}
            onDrop={(event) => {
              if (!draggedMenuKey) return;
              event.preventDefault();
              event.stopPropagation();
              const target = getSidebarDropTarget(event.clientX, event.clientY);
              const draggedKey =
                event.dataTransfer.getData("text/plain") || draggedMenuKey;
              if (target && draggedKey) {
                handleSidebarMenuDrop(target.dropKey, target.position, draggedKey);
              } else {
                setDraggedMenuKey(null);
                setDragTarget(null);
              }
            }}
          >
            <Menu
              theme={isDark ? "dark" : "light"}
              mode="inline"
              defaultOpenKeys={SIDEBAR_SECTION_KEYS}
              selectedKeys={[location.pathname]}
              items={draggableMenu}
              onClick={handleMenuClick}
            />
          </div>

          <div
            className={`sidebar-credits-card sidebar-credits-card--${creditHealth}`}
            title={collapsed ? `${availableCredits.toLocaleString()} Credits` : undefined}
          >
            {collapsed ? (
              <button
                type="button"
                className="sidebar-credits-compact"
                onClick={() => setIsTopUpModalOpen(true)}
                aria-label="View Sensible Credits"
              >
                <Zap size={16} />
                <span className={`sidebar-credits-compact-dot ${creditHealth}`} />
              </button>
            ) : (
              <>
                <div className="sidebar-credits-header">
                  <div className="sidebar-credits-title-wrap">
                    <Zap size={13} className="credits-header-bolt" />
                    <span className="sidebar-credits-label">Sensible Credits</span>
                  </div>
                </div>

                <div className="sidebar-credits-balance-row">
                  <div className="sidebar-credits-val-wrap">
                    <strong className="sidebar-credits-val">{availableCredits.toLocaleString()}</strong>
                    <span className="sidebar-credits-unit">Credits</span>
                  </div>
                  <span
                    className={`sidebar-credits-health-pill ${creditHealth}`}
                    title={creditHealth === "green" ? "Healthy Balance" : creditHealth === "yellow" ? "Low Balance" : "Critical - Reload Required"}
                  >
                    <span className="health-dot" />
                    {creditHealth === "green" ? "Healthy" : creditHealth === "yellow" ? "Low" : "Reload"}
                  </span>
                </div>

                <button
                  type="button"
                  className="sidebar-credits-topup-btn"
                  onClick={() => setIsTopUpModalOpen(true)}
                >
                  <Plus size={12} /> Add Credits
                </button>
              </>
            )}
          </div>
        </div>
      </Sider>

      {/* MAIN AREA */}
      <Layout
        className="app-main"
        style={
          {
            marginLeft: siderWidth,
            "--app-sidebar-width": `${siderWidth}px`,
          } as React.CSSProperties
        }
      >
        <HeaderBar
          user={profileUser && {
            ...profileUser,
            role: formatRoleLabel(currentRole),
          }}
          handleLogout={handleLogout}
          aiMode={aiMode}
          onToggleAiMode={() => setAiMode((prev) => !prev)}
          showAiToggle={Boolean(outletId && hasAnyPermission(["leads.read"]))}
          outletId={outletId || undefined}
          availableCredits={availableCredits}
          creditHealth={creditHealth}
          onOpenTopUpModal={() => setIsTopUpModalOpen(true)}
        />

        {aiMode && outletId ? (
          <Content className="app-content app-content--ai-mode">
            <AiModeScreen outletId={outletId} />
          </Content>
        ) : (
          <Content className="app-content" style={{ margin: "16px" }}>
            {permissionRefreshError && (
              <Alert
                type="warning"
                showIcon
                message="Permission refresh failed"
                description={permissionRefreshError}
                style={{ marginBottom: 16 }}
              />
            )}
            <Suspense fallback={<SpinLoader height="60vh" />}>
              <RouterOutlet />
            </Suspense>
          </Content>
        )}
        {!aiMode && outletId && hasAnyPermission(["leads.read"]) && (
          <CrmAssistant outletId={outletId} />
        )}
      </Layout>

      {outletId && (
        <CreditTopUpModal
          open={isTopUpModalOpen}
          onClose={() => setIsTopUpModalOpen(false)}
          outletId={outletId}
          wallet={wallet}
          onSuccess={() => {
            void billingApi.getWallet(outletId).then((res) => {
              if (res?.wallet) setWallet(res.wallet);
            });
          }}
        />
      )}
    </Layout>
  );

  // return (
  //   <Layout style={{ minHeight: "100vh" }}>
  //     <Sider
  //       collapsible
  //       collapsed={collapsed}
  //       onCollapse={(value) => setCollapsed(value)}
  //       style={{ position: "sticky", top: 0 }}
  //     >
  //       <div className="demo-logo-vertical" />
  //       <Menu
  //         theme="dark"
  //         mode="inline"
  //          selectedKeys={[location.pathname]}
  //         items={items}
  //         onClick={handleMenuClick}
  //       />
  //     </Sider>
  //     <Layout>
  //       <HeaderBar
  //         outletInfo={{ name: outletInfo?.name }}
  //         user={{ name: user?.name, email: user?.email }}
  //         handleLogout={() => handleLogout()}
  //       />
  //       <Content style={{ margin: "16px" }}>
  //         <Outlet />
  //       </Content>
  //     </Layout>
  //   </Layout>
  // );
};

export default MainLayout;
