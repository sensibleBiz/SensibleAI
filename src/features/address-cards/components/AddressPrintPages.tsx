import { Pencil, Phone, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import type {
  AddressCardSettings,
  AddressRecord,
} from "./types";
import {
  ADDRESS_CARD_TITLE,
  CARDS_PER_PAGE,
  chunkArray,
  getAddressCardContent,
  isAddressContentLikelyTooLong,
} from "@/features/address-cards/utils/addressCards";

interface AddressPrintPagesProps {
  addresses: AddressRecord[];
  settings: AddressCardSettings;
  onDeleteAddress: (address: AddressRecord) => void;
  onEditAddress: (address: AddressRecord) => void;
}

function AddressCard({
  address,
  settings,
  onDeleteAddress,
  onEditAddress,
}: {
  address: AddressRecord;
  settings: AddressCardSettings;
  onDeleteAddress: (address: AddressRecord) => void;
  onEditAddress: (address: AddressRecord) => void;
}) {
  const content = getAddressCardContent(address, settings);
  const hasOverflowRisk = isAddressContentLikelyTooLong(address, settings);
  const fontScale = settings.fontSize / 8.5;
  const scaledPt = (value: number) => `${(value * fontScale).toFixed(2)}pt`;
  const cardStyle = {
    "--address-card-padding": `${settings.paddingMm}mm`,
    "--address-card-title-size": scaledPt(8),
    "--address-card-title-line-height": scaledPt(10),
    "--address-card-company-size": scaledPt(11),
    "--address-card-company-line-height": scaledPt(13),
    "--address-card-address-size": `${settings.fontSize}pt`,
    "--address-card-address-line-height": scaledPt(10),
    "--address-card-metadata-size": scaledPt(7),
    "--address-card-metadata-line-height": scaledPt(8),
    "--address-card-phone-size": scaledPt(9),
    "--address-card-phone-line-height": scaledPt(11),
  } as CSSProperties;

  return (
    <div className="address-print-card-shell">
      <div className="address-card-actions no-print" role="group" aria-label={`Actions for ${content.companyName}`}>
        <button
          type="button"
          className="address-card-action address-card-action--edit"
          title={`Edit ${content.companyName}`}
          aria-label={`Edit ${content.companyName}`}
          onClick={() => onEditAddress(address)}
        >
          <Pencil aria-hidden="true" />
        </button>
        <button
          type="button"
          className="address-card-action address-card-action--delete"
          title={`Delete ${content.companyName}`}
          aria-label={`Delete ${content.companyName}`}
          onClick={() => onDeleteAddress(address)}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>
      <article
        className={`address-print-card ${
          settings.showBorder ? "address-print-card--bordered" : ""
        }`}
        style={cardStyle}
        aria-label={`Address card for ${address.name || address.company || "recipient"}`}
      >
        <p className="address-card-title">{ADDRESS_CARD_TITLE}</p>
        <h3 className="address-card-company">{content.companyName}</h3>
        {content.address && (
          <p className="address-card-address">{content.address}</p>
        )}
        {content.metadata.length > 0 && (
          <p className="address-card-metadata">{content.metadata.join(" · ")}</p>
        )}
        {content.phone && (
          <p className="address-card-phone">
            <Phone className="address-card-phone-icon" aria-hidden="true" />
            <span>{content.phone}</span>
          </p>
        )}
      </article>
      {hasOverflowRisk && (
        <span className="address-card-overflow-warning no-print">
          Content may overflow
        </span>
      )}
    </div>
  );
}

export default function AddressPrintPages({
  addresses,
  settings,
  onDeleteAddress,
  onEditAddress,
}: AddressPrintPagesProps) {
  const pages = chunkArray(addresses, CARDS_PER_PAGE);

  if (!pages.length) {
    return (
      <div className="no-print flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
        <div>
          <p className="font-semibold text-slate-700">No cards generated</p>
          <p className="mt-1 text-sm text-slate-500">
            Upload an Excel file to generate the A4 card preview.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="address-print-root"
    >
      {pages.map((pageCards, pageIndex) => (
        <section
          key={`address-page-${pageIndex + 1}`}
          className="a4-address-page"
          aria-label={`A4 address card page ${pageIndex + 1}`}
        >
          {pageCards.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              settings={settings}
              onDeleteAddress={onDeleteAddress}
              onEditAddress={onEditAddress}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
