import { Router, Request, Response } from "express";

export const mobileRouter = Router();

mobileRouter.get("/version", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      latestVersion: "1.0.1",
      buildNumber: 2,
      minSupportedVersion: "1.0.0",
      downloadUrl: "https://sales.sensible.biz/downloads/sensible-crm-enterprise.apk",
      releaseNotes: "Sensible AI CRM Enterprise v1.0.1\n• Dual-SIM Telephony auto-sync to PostgreSQL\n• Real-time Floating Caller ID popup\n• Offline call log caching & flush\n• Field Attendance GPS check-in",
      mandatory: false,
      publishedAt: new Date().toISOString(),
    },
  });
});
