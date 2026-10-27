import { Button, Dropdown, message } from "antd";
import type { MenuProps } from "antd";
import { Copy } from "lucide-react";

export interface CopyLinkOption {
  label: string;
  link: string;
  eventId?: string;
  outletId?: string;
  businessType?: string;
}

interface CopyLinkButtonProps {
  link: string;
  label?: string;
  successMessage?: string;
  type?: "primary" | "default" | "text" | "link" | "dashed";
  eventId?: string;
  outletId?: string;
  businessType?: string;
  linkOptions?: CopyLinkOption[];
}

export default function CopyLinkButton({
  link,
  label = "Copy Link",
  successMessage = "Registration link copied",
  type = "default",
  eventId,
  outletId,
  businessType,
  linkOptions,
}: CopyLinkButtonProps) {
  const copyLink = async (target: CopyLinkOption) => {
    try {
      const selectedEventId = target.eventId ?? eventId;
      const selectedOutletId = target.outletId ?? outletId;
      const selectedBusinessType = target.businessType ?? businessType;

      if (selectedEventId) {
        sessionStorage.setItem("eventId", selectedEventId);
      }
      if (selectedOutletId) {
        sessionStorage.setItem("outletId", selectedOutletId);
      }
      if (selectedBusinessType) {
        sessionStorage.setItem("eventBusinessType", selectedBusinessType);
      } else if (selectedEventId) {
        sessionStorage.removeItem("eventBusinessType");
      }

      await navigator.clipboard.writeText(target.link);
      message.success(successMessage);
    } catch {
      message.error("Unable to copy link");
    }
  };

  const menuOptions = (linkOptions ?? []).filter((option) => option.link);

  if (menuOptions.length > 1) {
    const items: MenuProps["items"] = menuOptions.map((option, index) => ({
      key: String(index),
      label: option.label,
    }));

    const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
      const option = menuOptions[Number(key)];
      if (option) {
        void copyLink(option);
      }
    };

    return (
      <Dropdown
        menu={{ items, onClick: handleMenuClick }}
        placement="bottomLeft"
        trigger={["click"]}
      >
        <Button type={type} icon={<Copy size={16} />} aria-label={label || "Copy Link"}>
          {label}
        </Button>
      </Dropdown>
    );
  }

  return (
    <Button
      type={type}
      icon={<Copy size={16} />}
      onClick={() =>
        void copyLink({
          label,
          link,
          eventId,
          outletId,
          businessType,
        })
      }
      aria-label={label || "Copy Link"}
    >
      {label}
    </Button>
  );
}
