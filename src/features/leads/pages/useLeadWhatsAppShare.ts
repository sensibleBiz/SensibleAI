import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import type { LeadsManagement } from "../types/types";
import { leadApi } from "../api/leadApi";
import type { RootState } from "@/app/store";
import { ROUTES_PATHS } from "@/shared/lib/constants";

const WHATSAPP_SHARE_WINDOW_NAME = "sensible-crm-whatsapp-share";
let whatsappShareWindow: Window | null = null;

const openOrReuseWhatsAppWindow = () => {
  if (whatsappShareWindow && !whatsappShareWindow.closed) {
    try {
      whatsappShareWindow.location.href = "about:blank";
      whatsappShareWindow.focus();
      return whatsappShareWindow;
    } catch {
      whatsappShareWindow = null;
    }
  }

  whatsappShareWindow = window.open(
    "about:blank",
    WHATSAPP_SHARE_WINDOW_NAME,
  );
  whatsappShareWindow?.focus();
  return whatsappShareWindow;
};

const maskLeadMobile = (lead: LeadsManagement) => {
  const mobile = lead.mobile || lead.phone || lead.mobileAlt || "";
  const digits = mobile.replace(/\D/g, "");
  if (!digits) return "N/A";

  const localNumber = digits.length > 10 ? digits.slice(-10) : digits;
  return `${localNumber.slice(0, 4)}${"*".repeat(
    Math.max(0, localNumber.length - 4),
  )}`;
};

const buildLeadWhatsAppMessage = (
  lead: LeadsManagement,
  crmLeadLink: string,
) => {
  const business =
    lead.businessName?.trim() || lead.businessType?.trim() || "N/A";
  const location =
    [lead.city, lead.state, lead.area]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(", ") || "N/A";
  const requirement = lead.requirement?.trim() || "N/A";
  const leadName =
    lead.username?.trim() || lead.followUpName?.trim() || "Lead";

  return [
    "Lead",
    leadName,
    `Mobile - ${maskLeadMobile(lead)}`,
    `Business - ${business}`,
    `Location - ${location}`,
    `Requirement - ${requirement}`,
    `Open in CRM - ${crmLeadLink}`,
  ].join("\n");
};

export const useLeadWhatsAppShare = (lead: LeadsManagement) => {
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo.id,
  );
  const [shareCount, setShareCount] = useState(
    lead.whatsappShareCount ?? 0,
  );
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    setShareCount(lead.whatsappShareCount ?? 0);
  }, [lead.id, lead.whatsappShareCount]);

  const shareLead = useCallback(async () => {
    if (!outletId || !lead.id || sharing) return;

    const shareWindow = openOrReuseWhatsAppWindow();
    if (shareWindow) {
      try {
        shareWindow.document.title = "Preparing secure CRM link";
        shareWindow.document.body.textContent = "Preparing secure CRM link…";
      } catch {
        // Cross-origin tabs can still be navigated even when their DOM is private.
      }
    }

    setSharing(true);
    setShareCount((count) => count + 1);

    try {
      const result = await leadApi.recordWhatsAppShare(outletId, lead.id);
      setShareCount((count) => Math.max(count, result.whatsappShareCount));

      const sharePath = ROUTES_PATHS.LEAD_SHARE.replace(
        ":shareToken",
        encodeURIComponent(result.shareToken),
      );
      const crmLeadUrl = new URL(sharePath, window.location.origin);
      const message = buildLeadWhatsAppMessage(lead, crmLeadUrl.toString());
      const whatsappUrl = `https://web.whatsapp.com/send?text=${encodeURIComponent(
        message,
      )}`;

      if (shareWindow && !shareWindow.closed) {
        whatsappShareWindow = shareWindow;
        shareWindow.location.href = whatsappUrl;
        shareWindow.focus();
        return;
      }

      whatsappShareWindow = window.open(
        whatsappUrl,
        WHATSAPP_SHARE_WINDOW_NAME,
      );
      whatsappShareWindow?.focus();
    } catch (error) {
      setShareCount((count) => Math.max(0, count - 1));
      if (shareWindow && !shareWindow.closed) {
        try {
          shareWindow.document.body.textContent =
            "Unable to prepare the secure CRM link. Please close this window and try again.";
        } catch {
          shareWindow.close();
        }
      }
      throw error;
    } finally {
      setSharing(false);
    }
  }, [lead, outletId, sharing]);

  return { shareCount, shareLead, sharing };
};
