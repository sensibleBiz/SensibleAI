import { LeadsManagement } from "../types/types";
import {
  FaFacebook,
  FaGoogle,
  FaHandshake,
  FaWalking,
  FaWhatsapp,
} from "react-icons/fa";
import {
  PhoneOutlined,
  EnvironmentOutlined,
  CalendarOutlined,
  GlobalOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, Card, Divider, Space, Tag, Tooltip, Typography } from "antd";
import { LEAD_STAGE } from "@/shared/lib/constants";
import { LogoIcon } from "@/shared/components";
import { useCrmTerminology } from "@/shared/hooks";
import { useLeadWhatsAppShare } from "./useLeadWhatsAppShare";
import {
  formatLeadStatusLabel,
  toTitleCase,
} from "@/shared/utils/helperFunctions";
const { Text } = Typography;
interface LeadCardProps {
  lead: LeadsManagement;
  onView?: (lead: LeadsManagement) => void;
  assignedEmployeeName?: string;
  isExport?: boolean;
}

const LeadCard: React.FC<LeadCardProps> = ({
  lead,
  onView,
  assignedEmployeeName,
  isExport,
}) => {
  const { isExport: activeVerticalIsExport } = useCrmTerminology();
  const {
    shareCount: whatsappShareCount,
    shareLead,
    sharing,
  } = useLeadWhatsAppShare(lead);

  const getInitials = (username: string) => {
    return username
      ?.split(" ")
      ?.map((n) => n[0])
      ?.join("")
      ?.toUpperCase();
  };

  const initials = getInitials(lead?.username || "U");
  const showExportMetadata = isExport ?? activeVerticalIsExport;
  const exportCountryTags = showExportMetadata
    ? Object.entries(lead.customFields ?? {}).filter(
        ([key, value]) =>
          /country/i.test(key) &&
          (typeof value === "string" || typeof value === "number") &&
          String(value).trim().length > 0,
      )
    : [];
  const incotermEntry = showExportMetadata
    ? Object.entries(lead.customFields ?? {}).find(
        ([key, value]) =>
          /incoterm/i.test(key) &&
          (typeof value === "string" || typeof value === "number") &&
          String(value).trim().length > 0,
      )
    : undefined;
  const portEntry = showExportMetadata
    ? Object.entries(lead.customFields ?? {}).find(
        ([key, value]) =>
          /port|discharge|destination/i.test(key) &&
          !/country/i.test(key) &&
          (typeof value === "string" || typeof value === "number") &&
          String(value).trim().length > 0,
      )
    : undefined;

  const openWhatsAppWeb = (event: React.MouseEvent) => {
    event.stopPropagation();
    void shareLead().catch((error: unknown) => {
      console.error("Unable to record WhatsApp lead share:", error);
    });
  };

  // ✅ Source icons mapping
  const getSourceIcon = (source?: string) => {
    const src = source?.toLowerCase() || "";

    if (src.includes("just")) {
      return <LogoIcon src="/icons/justdial.svg" alt="Justdial" size={16} />;
    }

    if (src.includes("indiamart")) {
      return <LogoIcon src="/icons/indiamart.svg" alt="IndiaMART" size={16} />;
    }

    if (src.includes("facebook"))
      return <FaFacebook color="#1877F2" size={16} />;
    
    if (src.includes("google")) return <FaGoogle color="#DB4437" size={16} />;
    if (src.includes("walk")) return <FaWalking color="#FF9800" size={16} />;
    if (src.includes("ref")) return <FaHandshake color="#28A745" size={16} />;
    if (src.includes("web"))
      return <GlobalOutlined style={{ color: "#722ED1" }} />;
    return <UserOutlined style={{ color: "#999" }} />;
  };

  const stage = lead?.stage?.toUpperCase();
  const showAssignedEmployee =
    Boolean(assignedEmployeeName) &&
    [
      LEAD_STAGE.ASSIGNED,
      LEAD_STAGE.FOLLOWUP,
      LEAD_STAGE.WON,
      LEAD_STAGE.LOST,
    ].includes(stage as LEAD_STAGE);

  return (
    <Card
      hoverable
      onClick={() => onView?.(lead)}
      className="lead-card"
      style={{
        borderRadius: "10px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
        marginBottom: "16px",
        transition: "all 0.2s ease",
        //  padding: "16px"
      }}
      // bodyStyle={{ }}
    >
      {lead?.status === "RINGING" && lead?.stage == LEAD_STAGE.NEW && (
        <Tag
          color="orange"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            fontWeight: 600,
            borderRadius: 6,
          }}
        >
          🔔 {formatLeadStatusLabel(lead?.status, "Ringing")}
        </Tag>
      )}

      {/* Header Section */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "12px",
        }}
      >
        <Avatar
          size={42}
          style={{ backgroundColor: "#4A90E2", fontWeight: 600 }}
        >
          {initials}
        </Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Tooltip title={toTitleCase(lead?.username, "Unknown User")}>
            <Text
              strong
              style={{ fontSize: "15px", color: "#1a1a1a" }}
              ellipsis
            >
              {toTitleCase(lead?.username, "Unknown User")}
            </Text>
          </Tooltip>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "#666",
            }}
          >
            {getSourceIcon(lead?.source)}
            {/* <span>{lead?.source || "N/A"}</span> */}
            <span>{lead?.leadCampaign || ""}</span>
          </div>
          {showAssignedEmployee && (
            <Tooltip title={assignedEmployeeName}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginTop: "4px",
                  fontSize: "12px",
                  color: "#4b5563",
                  minWidth: 0,
                }}
              >
                <UserOutlined style={{ color: "#2563eb" }} />
                <Text
                  ellipsis
                  style={{
                    fontSize: "12px",
                    color: "#4b5563",
                    maxWidth: "180px",
                  }}
                >
                  Assigned: {assignedEmployeeName}
                </Text>
              </div>
            </Tooltip>
          )}
          <div style={{ marginTop: 4 }}>
            <Tag color={lead.customerId ? "green" : "default"}>
              {lead.customerId ? "Customer" : "Prospect"}
            </Tag>
            <Tag color="blue">
              {lead.enquiryType === "CUSTOMER_ENQUIRY"
                ? "Customer Enquiry"
                : "New Lead"}
            </Tag>
          </div>
          {showExportMetadata && (exportCountryTags.length > 0 || incotermEntry || portEntry) && (
            <Space size={[4, 4]} wrap style={{ marginTop: 5 }}>
              {exportCountryTags.map(([key, value]) => (
                <Tag color="cyan" key={`${key}-${String(value)}`}>
                  {`🌍 ${String(value).trim()}`}
                </Tag>
              ))}
              {incotermEntry && portEntry && (
                <Tag color="purple" style={{ fontWeight: 600 }}>
                  {`${String(incotermEntry[1]).trim()} · ${String(portEntry[1]).trim()}`}
                </Tag>
              )}
              {incotermEntry && !portEntry && (
                <Tag color="purple">
                  {`Incoterm: ${String(incotermEntry[1]).trim()}`}
                </Tag>
              )}
              {!incotermEntry && portEntry && (
                <Tag color="geekblue">
                  {`Port: ${String(portEntry[1]).trim()}`}
                </Tag>
              )}
            </Space>
          )}
        </div>
      </div>

      {/* Contact Info */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            color: "#333",
          }}
        >
          <PhoneOutlined style={{ color: "#FF7A45" }} />
          <span className="font-bold">{lead?.mobile || "N/A"}</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            color: "#666",
          }}
        >
          <EnvironmentOutlined />
          <Text
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "180px",
            }}
          >
            {lead?.city
              ? `${toTitleCase(lead?.city)}${lead?.state ? `, ${toTitleCase(lead?.state)}` : ""}`
              : "Location Not Available"}
          </Text>
        </div>
      </div>

      <Divider style={{ margin: "10px 0" }} />

      {/* Footer Section */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            color: "#666",
          }}
        >
          <CalendarOutlined />
          <Text type="secondary" style={{ fontSize: "12px" }}>
            {lead?.date || (lead?.createdDate
              ? new Date(lead.createdDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
              : "N/A")}
          </Text>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minWidth: 0,
          }}
        >
          <Tooltip
            title={`Share CRM lead link on WhatsApp (${whatsappShareCount} clicks)`}
          >
            <button
              type="button"
              aria-label={`Share lead on WhatsApp. Shared ${whatsappShareCount} times`}
              onClick={openWhatsAppWeb}
              disabled={sharing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                padding: 0,
                margin: 0,
                border: "none",
                background: "transparent",
                cursor: sharing ? "wait" : "pointer",
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              <FaWhatsapp color="#25D366" size={18} />
              <span
                style={{
                  color: "#389e0d",
                  fontSize: "12px",
                  fontWeight: 600,
                  minWidth: "8px",
                }}
              >
                {whatsappShareCount}
              </span>
            </button>
          </Tooltip>
          <Tooltip title={lead?.requirement}>
            <Tag
              color="blue"
              style={{
                margin: 0,
                fontSize: "12px",
                fontWeight: 500,
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                maxWidth: "120px",
                overflow: "hidden",
              }}
            >
              {lead?.requirement || "No Requirement"}
            </Tag>
          </Tooltip>
        </div>
      </div>
    </Card>
  );
};

export default LeadCard;
