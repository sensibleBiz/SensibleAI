export interface ProductImage {
  url: string;
  isPrimary?: boolean;
  alt?: string;
}

export interface ProductCustomFields {
  images?: ProductImage[];
  hsnCode?: string;
  unit?: string;
  tags?: string[];
  features?: string[];
  specifications?: Record<string, string>;
  whatsappPitch?: string;
  volumeTiers?: Array<{ minQty: number; price: number }>;
  aiMetadata?: {
    generatedAt?: string;
    model?: string;
    confidence?: number;
  };
  [key: string]: unknown;
}

export interface ProductItem {
  id: string;
  name: string;
  sku?: string;
  brand?: string;
  categoryId?: string | null;
  categoryName?: string;
  description?: string;
  mrpPrice: number; // customer retail price
  price: number; // dealer / wholesale price
  purchasePrice?: number; // cost price
  taxPercent?: number; // GST tax slab %
  isAddOn?: boolean;
  active?: boolean;
  isDeleted?: boolean;
  minUnit?: {
    length?: string;
    width?: string;
    height?: string;
    weight?: string;
    volume?: string;
  };
  uidMap?: Record<string, unknown>;
  customFields?: ProductCustomFields;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductAiOutput {
  name: string;
  brand: string;
  category: string;
  description: string;
  features: string[];
  specifications: Record<string, string>;
  suggestedHsnCode: string;
  suggestedGstRate: number;
  suggestedMrp: number;
  suggestedPrice: number;
  suggestedPurchasePrice: number;
  suggestedUnit: string;
  tags: string[];
  whatsappPitch: string;
}
