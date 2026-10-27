import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "../../config/env.js";

export const productAiOutputSchema = z.object({
  name: z.string().trim().min(1).max(500),
  brand: z.string().trim().max(500).default(""),
  category: z.string().trim().max(500).default("General"),
  description: z.string().trim().max(5000).default(""),
  features: z.array(z.string().trim()).max(12).default([]),
  specifications: z.record(z.string().trim()).default({}),
  suggestedHsnCode: z.string().trim().max(32).default(""),
  suggestedGstRate: z.number().min(0).max(100).default(18),
  suggestedMrp: z.number().min(0).default(0),
  suggestedPrice: z.number().min(0).default(0),
  suggestedPurchasePrice: z.number().min(0).default(0),
  suggestedUnit: z.string().trim().max(32).default("PCS"),
  tags: z.array(z.string().trim()).max(10).default([]),
  whatsappPitch: z.string().trim().max(4000).default(""),
}).strict();

export type ProductAiOutput = z.infer<typeof productAiOutputSchema>;

export interface GenerateProductAiInput {
  prompt?: string;
  name?: string;
  brand?: string;
  category?: string;
  targetPrice?: number;
}

export interface AnalyzeProductImageAiInput {
  imageBase64: string;
  mimeType: string;
  prompt?: string;
}

let client: GoogleGenAI | undefined;

const getGenAiClient = (): GoogleGenAI | null => {
  if (client) return client;
  try {
    const httpOptions = { timeout: 30000 };
    if (env.googleAi.useEnterprise) {
      if (!env.googleAi.project || !env.googleAi.location) return null;
      client = new GoogleGenAI({
        enterprise: true,
        project: env.googleAi.project,
        location: env.googleAi.location,
        httpOptions,
      });
    } else {
      if (!env.googleAi.apiKey) return null;
      client = new GoogleGenAI({ apiKey: env.googleAi.apiKey, httpOptions });
    }
    return client;
  } catch (error) {
    console.warn("Failed to initialize GoogleGenAI for Product AI:", error);
    return null;
  }
};

const SYSTEM_INSTRUCTION = `You are a world-class commercial product catalog specialist and copywriter for an enterprise CRM and B2B/B2C commerce suite.
Your task is to generate complete, high-converting, accurate product catalog specifications in valid JSON matching this schema:
{
  "name": "Commercial product name (clear, professional, formatted)",
  "brand": "Brand or manufacturer name",
  "category": "Suggested category name (e.g. Industrial Equipment, Electronics, Consumables, Hardware, Apparel)",
  "description": "Engaging, comprehensive 2-3 sentence overview highlighting value and application",
  "features": ["Bullet point 1", "Bullet point 2", "Bullet point 3", "Bullet point 4"],
  "specifications": { "Key": "Value" } (e.g. Material, Dimensions, Capacity, Warranty, Power, Finish),
  "suggestedHsnCode": "Standard Indian HSN/SAC code (4 to 8 digits)",
  "suggestedGstRate": 0 or 5 or 12 or 18 or 28,
  "suggestedMrp": Customer MRP numeric value,
  "suggestedPrice": Dealer wholesale price numeric value (typically 15-30% lower than MRP),
  "suggestedPurchasePrice": Estimated cost/purchase price,
  "suggestedUnit": "PCS" | "SET" | "BOX" | "KG" | "MTR" | "LTR" | "PACK",
  "tags": ["bestseller", "commercial", "heavy-duty"],
  "whatsappPitch": "A ready-to-share WhatsApp message with emojis, bold product title, key bullet points, and pricing placeholder."
}

Always return ONLY valid JSON. Do not wrap in markdown quotes if possible.`;

const buildFallbackProduct = (input: GenerateProductAiInput): ProductAiOutput => {
  const baseName = (input.name || input.prompt || "New Commercial Product").trim();
  const target = input.targetPrice && input.targetPrice > 0 ? input.targetPrice : 5000;
  const dealer = Math.round(target * 0.8);
  const cost = Math.round(target * 0.6);

  return {
    name: baseName,
    brand: input.brand || "Sensible Commercial",
    category: input.category || "General Products",
    description: `High-performance ${baseName} designed for commercial durability and reliable everyday operation. Engineered to industry standards with premium build quality.`,
    features: [
      "Industrial grade construction for maximum lifespan",
      "Energy-efficient and low-maintenance operation",
      "Comprehensive manufacturer warranty support",
      "Quick plug-and-play installation",
    ],
    specifications: {
      Material: "High-grade alloy / composite",
      Standard: "ISO 9001 certified",
      Warranty: "1 Year Standard Warranty",
      Unit: "Standard Package",
    },
    suggestedHsnCode: "8421",
    suggestedGstRate: 18,
    suggestedMrp: target,
    suggestedPrice: dealer,
    suggestedPurchasePrice: cost,
    suggestedUnit: "PCS",
    tags: ["commercial", "standard", "popular"],
    whatsappPitch: `🌟 *${baseName}*\n\n✅ Industrial-grade reliability\n✅ Low maintenance & high efficiency\n✅ 1-Year Comprehensive Warranty\n\n💰 *Special Price:* ₹${target.toLocaleString("en-IN")}\n\nReply to this message for immediate dispatch or custom volume pricing! 📦`,
  };
};

export const productAiService = {
  async generateProduct(input: GenerateProductAiInput): Promise<ProductAiOutput> {
    const genAi = getGenAiClient();
    if (!genAi) {
      return buildFallbackProduct(input);
    }

    const userPrompt = [
      input.prompt ? `User Prompt: ${input.prompt}` : null,
      input.name ? `Product Name: ${input.name}` : null,
      input.brand ? `Brand: ${input.brand}` : null,
      input.category ? `Category: ${input.category}` : null,
      input.targetPrice ? `Target Price (INR): ₹${input.targetPrice}` : null,
    ].filter(Boolean).join("\n");

    try {
      const response = await genAi.models.generateContent({
        model: env.googleAi.assistantModel || "gemini-3.8-flash",
        contents: userPrompt || "Generate a sample high-performing commercial B2B product",
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          temperature: 0.3,
        },
      });

      const rawText = response.text || "{}";
      const cleaned = rawText.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      const validated = productAiOutputSchema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }
      return buildFallbackProduct(input);
    } catch (error) {
      console.warn("Product AI generation fallback triggered:", error);
      return buildFallbackProduct(input);
    }
  },

  async analyzeProductImage(input: AnalyzeProductImageAiInput): Promise<ProductAiOutput> {
    const genAi = getGenAiClient();
    if (!genAi) {
      return buildFallbackProduct({ prompt: input.prompt || "Extracted from Image" });
    }

    try {
      const cleanBase64 = input.imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
      const response = await genAi.models.generateContent({
        model: env.googleAi.assistantModel || "gemini-3.8-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  data: cleanBase64,
                  mimeType: input.mimeType || "image/jpeg",
                },
              },
              {
                text: input.prompt
                  ? `Analyze this product photo/spec sheet and extract product catalog specifications.\nAdditional instructions: ${input.prompt}`
                  : "Analyze this product photo, packaging label, or technical spec sheet. Extract the product title, brand, category, commercial description, key features, technical specifications table, estimated HSN code, GST slab, and realistic pricing.",
              },
            ],
          },
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const rawText = response.text || "{}";
      const cleaned = rawText.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      const validated = productAiOutputSchema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }
      return buildFallbackProduct({ prompt: input.prompt || "Analyzed Image" });
    } catch (error) {
      console.warn("Product AI image analysis fallback triggered:", error);
      return buildFallbackProduct({ prompt: input.prompt || "Analyzed Image" });
    }
  },
};

