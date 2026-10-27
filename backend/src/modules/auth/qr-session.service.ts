import { AppError } from "../../errors/appError.js";
import { qrSessionRepository, type QrSessionRepository } from "./qr-session.repository.js";

const QR_SESSION_TTL_SECONDS = 30;

export class QrSessionService {
  constructor(private readonly repository: QrSessionRepository = qrSessionRepository) {}

  create() {
    return this.repository.create(QR_SESSION_TTL_SECONDS);
  }

  async get(sessionId: string) {
    const session = await this.repository.find(sessionId);
    if (!session) throw new AppError(404, "QR session was not found", "QR_SESSION_NOT_FOUND");
    return session;
  }

  async claim(sessionId: string, profileId: string) {
    if (!await this.repository.claim(sessionId, profileId)) {
      throw new AppError(409, "QR session is expired or already claimed", "QR_SESSION_UNAVAILABLE");
    }
    return this.get(sessionId);
  }

  async consume(sessionId: string) {
    const userId = await this.repository.consume(sessionId);
    if (!userId) throw new AppError(409, "QR session is unavailable or already exchanged", "QR_SESSION_UNAVAILABLE");
    return userId;
  }
}

export const qrSessionService = new QrSessionService();
