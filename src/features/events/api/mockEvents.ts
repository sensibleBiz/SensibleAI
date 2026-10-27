import { EventItem, EventParticipant } from "../types/eventTypes";

const origin =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";

export const mockEvents: EventItem[] = [
  {
    id: "evt-1001",
    name: "Retail Growth Summit",
    description:
      "A practical growth event for retailers, distributors, and CRM leaders focused on lead conversion and customer retention.",
    terms:
      "Registration is non-transferable. Entry is subject to confirmation at the venue. Event schedule may change with prior notice.",
    location: "Mumbai Convention Centre",
    address: "Hall B, BKC, Mumbai, Maharashtra 400051",
    eventDateTime: "2026-07-18T10:00:00",
    registrationExpiryDate: "2026-07-15T23:59:00",
    registrationType: "paid",
    fees: 1499,
    imageUrl:
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1400&q=80",
    status: "Active",
    totalRegistrations: 128,
    registrationLink: `${origin}/event-register/evt-1001`,
  },
  {
    id: "evt-1002",
    name: "Dealer Success Workshop",
    description:
      "Hands-on workshop for dealer onboarding, wallet adoption, repeat purchase workflows, and support operations.",
    terms:
      "Participants must carry a valid ID. Fees include workshop material and refreshments. No on-spot cancellation refund.",
    location: "Sensible CRM Training Hub",
    address: "2nd Floor, SG Highway, Ahmedabad, Gujarat 380054",
    eventDateTime: "2026-08-04T14:30:00",
    registrationExpiryDate: "2026-08-01T18:00:00",
    registrationType: "paid",
    fees: 799,
    imageUrl:
      "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=80",
    status: "Active",
    totalRegistrations: 74,
    registrationLink: `${origin}/event-register/evt-1002`,
  },
  {
    id: "evt-1003",
    name: "WhatsApp CRM Automation Bootcamp",
    description:
      "A compact bootcamp covering broadcast planning, customer segmentation, support workflows, and responsible automation.",
    terms:
      "Seats are limited and confirmed after registration. Attendees agree to receive event communication on WhatsApp.",
    location: "Online",
    address: "Live webinar link will be shared after registration",
    eventDateTime: "2026-06-10T16:00:00",
    registrationExpiryDate: "2026-06-08T23:59:00",
    registrationType: "paid",
    fees: 499,
    imageUrl:
      "https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1400&q=80",
    status: "Expired",
    totalRegistrations: 212,
    registrationLink: `${origin}/event-register/evt-1003`,
  },
  {
    id: "evt-1004",
    name: "Sales Leadership Roundtable",
    description:
      "Invite-only roundtable for sales managers to discuss team targets, reporting hygiene, and pipeline accountability.",
    terms:
      "This event is currently inactive. Invitations and registrations will reopen after final venue confirmation.",
    location: "Pune Business Centre",
    address: "Baner Road, Pune, Maharashtra 411045",
    eventDateTime: "2026-09-12T11:00:00",
    registrationExpiryDate: "2026-09-09T20:00:00",
    registrationType: "free",
    fees: 0,
    imageUrl:
      "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1400&q=80",
    status: "Inactive",
    totalRegistrations: 31,
    registrationLink: `${origin}/event-register/evt-1004`,
  },
  {
    id: "evt-1005",
    name: "Warehouse Operations Meet",
    description:
      "A field-focused session on stock movement, transfer approvals, product visibility, and branch coordination.",
    terms:
      "Registration closes two days before the event. Lunch is included. Venue access is restricted to registered users.",
    location: "Hyderabad Expo Hall",
    address: "HITEC City, Hyderabad, Telangana 500081",
    eventDateTime: "2026-10-03T09:30:00",
    registrationExpiryDate: "2026-10-01T17:00:00",
    registrationType: "paid",
    fees: 999,
    imageUrl:
      "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=1400&q=80",
    status: "Active",
    totalRegistrations: 56,
    registrationLink: `${origin}/event-register/evt-1005`,
  },
];

export const mockParticipants: EventParticipant[] = [
  {
    id: "reg-001",
    eventId: "evt-1001",
    name: "Aarav Shah",
    mobile: "9876543210",
    businessType: "Retailer",
    email: "aarav@example.com",
    companyName: "Shah Retail",
    city: "Mumbai",
    amount: 1499,
    paymentStatus: "Paid",
    registrationDate: "2026-06-21T12:20:00",
  },
  {
    id: "reg-002",
    eventId: "evt-1001",
    name: "Nisha Patel",
    mobile: "9823456710",
    businessType: "Distributor",
    companyName: "Patel Agencies",
    city: "Surat",
    amount: 1499,
    paymentStatus: "Pending",
    registrationDate: "2026-06-22T09:45:00",
  },
  {
    id: "reg-003",
    eventId: "evt-1001",
    name: "Kabir Mehta",
    mobile: "9811122233",
    businessType: "Service Provider",
    amount: 1499,
    paymentStatus: "Failed",
    registrationDate: "2026-06-23T16:05:00",
  },
  {
    id: "reg-004",
    eventId: "evt-1002",
    name: "Priya Iyer",
    mobile: "9900012345",
    businessType: "Dealer",
    companyName: "Iyer Enterprises",
    city: "Ahmedabad",
    amount: 799,
    paymentStatus: "Paid",
    registrationDate: "2026-06-19T10:15:00",
  },
  {
    id: "reg-005",
    eventId: "evt-1005",
    name: "Rohan Verma",
    mobile: "9765432109",
    businessType: "Warehouse Partner",
    city: "Hyderabad",
    amount: 999,
    paymentStatus: "Paid",
    registrationDate: "2026-06-18T14:35:00",
  },
];
