import type { EventMemberInput } from "./eventGateway.types.js";
import { AppError } from "../../errors/appError.js";
import { createEventInvoice } from "./eventInvoice.service.js";
import { eventMobilesMatch } from "./eventMobile.util.js";
import { sendEventPaymentWhatsApp } from "./eventWhatsApp.service.js";
import { createEventGatewayRepository } from "./createEventGatewayRepository.js";
import type { EventGatewayRepository } from "./eventGateway.repository.types.js";
import { PhonePeOfflineService, phonePeOfflineService } from "./phonePeOffline.service.js";

const toDate = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, "dateTime and expiryDate must be valid dates", "INVALID_DATE");
  }
  return date;
};

export class EventGatewayService {
  constructor(
    private readonly repository: EventGatewayRepository = createEventGatewayRepository(),
    private readonly phonePe: PhonePeOfflineService = phonePeOfflineService,
  ) {}

  async createEvent(body: Record<string, unknown>) {
    const { eventId, outletId, members, ...rest } = body;
    const patch: Record<string, unknown> = {};
    if (rest.title !== undefined) patch.title = rest.title;
    if (rest.terms !== undefined) patch.terms = rest.terms;
    if (rest.description !== undefined) patch.description = rest.description;
    if (rest.dateTime !== undefined) patch.dateTime = toDate(rest.dateTime);
    if (rest.expiryDate !== undefined) patch.expiryDate = toDate(rest.expiryDate);
    if (rest.address !== undefined) patch.address = rest.address;
    if (rest.location !== undefined) patch.location = rest.location;
    if (rest.postLink !== undefined) patch.postLink = rest.postLink;
    if (rest.fees !== undefined) patch.fees = Number(rest.fees);
    if (rest.isActive !== undefined) patch.isActive = rest.isActive;
    if (rest.imageUrl !== undefined) patch.imageUrl = rest.imageUrl;
    if (rest.offer !== undefined) patch.offer = Number(rest.offer);
    if (rest.imageList !== undefined) patch.imageList = rest.imageList;

    await this.repository.mergeEvent(
      String(outletId),
      String(eventId),
      patch,
      Array.isArray(members) ? members as EventMemberInput[] : undefined,
    );
    return { status: 1, message: "Event Saved Successfully" };
  }

  async getEvents(query: {
    outletId: string;
    eventId?: string;
    isActive?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    const events = await this.repository.listEvents({
      outletId: query.outletId,
      ...(query.eventId === undefined ? {} : { eventId: query.eventId }),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive === "true" }),
      ...(query.fromDate === undefined ? {} : { fromDate: query.fromDate }),
      ...(query.toDate === undefined ? {} : { toDate: query.toDate }),
    });
    return [{
      status: 1,
      message: events.length > 0 ? "Success" : "No Event Found!",
      count: events.length,
      data: events,
    }];
  }

  async getEventTransactions(query: { outletId: string; eventId?: string }) {
    const transactions = await this.repository.listEventTransactions(query);
    return [{
      status: 1,
      message: transactions.length > 0 ? "Success" : "No Event Found!",
      count: transactions.length,
      data: transactions,
    }];
  }

  async payAndRegister(body: Record<string, unknown>) {
    const isProd = body.isProd === true;
    const customerPhoneNumber = String(body.customerPhoneNumber ?? body.mobile ?? "");
    const phonePeResponse = await this.phonePe.initiatePayLink({
      isProd,
      transactionId: String(body.transactionId),
      merchantOrderId: String(body.merchantOrderId),
      amount: Number(body.amount),
      customerPhoneNumber,
    });

    const payload = phonePeResponse.body;
    const data = payload.data;
    const intentString =
      typeof data === "object" && data !== null && "intentString" in data
        ? String((data as Record<string, unknown>).intentString ?? "")
        : "";

    if (intentString) {
      await this.repository.saveMemberPendingPayment({
        outletId: String(body.outletId),
        eventId: String(body.eventId),
        transactionId: String(body.transactionId),
        intentString,
        mobile: String(body.mobile ?? customerPhoneNumber),
      });
      await sendEventPaymentWhatsApp([{
        name: intentString,
        mobile: customerPhoneNumber,
      }]);
    }

    return payload;
  }

  async checkPaymentStatus(body: Record<string, unknown>) {
    const isProd = body.isProd === true;
    const outletId = String(body.outletId);
    const eventId = String(body.eventId);
    const transactionId = String(body.transactionId);
    const amount = Number(body.amount);
    const mobile = String(body.mobile);
    const transactionType = body.transactionType ? String(body.transactionType) : undefined;
    const transactionTitle = body.transactionTitle ? String(body.transactionTitle) : undefined;

    const xbody = await this.phonePe.getTransactionStatus({ isProd, transactionId });
    const msg = xbody;
    const data = msg.data;
    const paymentState =
      data && typeof data === "object"
        ? String((data as Record<string, unknown>).paymentState ?? "")
        : "";

    if (!msg.success) {
      return { ...xbody, invoiceDetails: {} };
    }
    if (paymentState === "PENDING" || paymentState !== "COMPLETED") {
      return { ...xbody, invoiceDetails: {} };
    }

    const existing = await this.repository.findTransactionById(outletId, transactionId);
    if (existing) {
      return xbody;
    }

    await this.repository.addEventTransaction(outletId, {
      amount,
      eventId,
      date: new Date(),
      transactionId,
      message: "Event Payment has been done",
      paymentType: "PhonePe",
      remark: JSON.stringify(xbody),
      status: "SUCCESS",
    });

    const eventData = await this.repository.getEvent(outletId, eventId);
    if (!eventData) {
      return { ...xbody, invoiceDetails: {} };
    }

    const members = (eventData.members as EventMemberInput[] | undefined) ?? [];
    const todayTime = new Date();
    let memberObj: Record<string, string> = {};
    const sequence = members.length + 1;

    const updatedMembers = members.map((member) => {
      if (!eventMobilesMatch(member.mobile, mobile)) return member;
      memberObj = {
        customerName: member.name ?? "",
        city: member.city ?? "",
        mobile: String(member.mobile ?? ""),
        companyName: member.companyName ?? "",
      };
      return {
        ...member,
        amount,
        paymentStatus: "SUCCESS",
        transactionId,
        paymentDate: todayTime,
        ...(transactionTitle ? { transactionTitle } : {}),
        ...(transactionType ? { transactionType } : {}),
      };
    });

    await this.repository.updateEventMembers(outletId, eventId, updatedMembers);

    const now = new Date();
    const month = now.toLocaleString("en-US", { month: "short" }).toUpperCase();
    const year = now.getFullYear();
    const invoiceNo = `SCSPL-${month}-${year}-${String(sequence).padStart(4, "0")}`;

    const invoiceResponse = await createEventInvoice({
      eventName: String(eventData.title ?? ""),
      amount: Number(eventData.fees ?? amount),
      customerDetails: memberObj,
      invoiceNo,
      invoiceDate: new Date(),
      transactionId,
      outletId,
    });

    return {
      ...xbody,
      invoiceDetails: {
        invoiceUrl: invoiceResponse.fileLink,
        amount: body.amount,
        description: "",
        customerDetails: memberObj,
        invoiceNo: invoiceResponse.invoiceNo ?? invoiceNo,
        invoiceDate: new Date(),
        extra: [],
      },
    };
  }
}

export const eventGatewayService = new EventGatewayService();
