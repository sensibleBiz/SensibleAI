import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env.js";

/**
 * Gemini 3.8 Live WebSocket Gateway
 *
 * Capabilities:
 * - Low-latency bidirectional PCM audio streaming (16kHz in -> 24kHz out).
 * - Real-time speech transcription & conversational voice bot.
 * - Non-blocking asynchronous tool calling (behavior: NON_BLOCKING).
 * - Background reasoning with spoken conversational fillers (gemini-3.8-live-extended-thinking).
 */

export interface LiveSessionCallbacks {
  onAudioChunk?: (pcm24kBase64: string) => void;
  onTranscription?: (text: string, isUser: boolean) => void;
  onInterrupted?: () => void;
  onError?: (error: unknown) => void;
  onClose?: () => void;
}

export class GeminiLiveGateway {
  private readonly ai: GoogleGenAI;
  private readonly defaultModel: string;

  constructor() {
    const apiKey = env.googleAi.apiKey || process.env.GEMINI_API_KEY || "";
    this.ai = new GoogleGenAI({ apiKey });
    this.defaultModel = "gemini-3.8-live";
  }

  /**
   * Initializes a real-time live session with non-blocking tools
   */
  async startLiveSession(
    systemInstructionText: string,
    callbacks: LiveSessionCallbacks,
    useExtendedThinking = false,
  ) {
    const model = useExtendedThinking
      ? "gemini-3.8-live-extended-thinking"
      : this.defaultModel;

    const liveConfig: any = {
      responseModalities: ["audio"],
      systemInstruction: {
        parts: [
          {
            text:
              systemInstructionText ||
              "You are Sensible AI, the autonomous voice CRM copilot. Speak concisely, clearly, and naturally like an executive sales partner.",
          },
        ],
      },
      // Non-blocking tools are mandatory on Gemini 3.8 Live
      tools: [
        {
          functionDeclarations: [
            {
              name: "search_customer_status",
              description: "Look up a customer's open deals, overdue invoices, and recent activity",
              parameters: {
                type: "OBJECT",
                properties: {
                  phoneOrName: { type: "STRING", description: "Customer name or phone number" },
                },
                required: ["phoneOrName"],
              },
              behavior: "NON_BLOCKING",
            },
            {
              name: "send_upi_payment_link",
              description: "Generate and send a PhonePe UPI payment link to the customer over WhatsApp",
              parameters: {
                type: "OBJECT",
                properties: {
                  amountInr: { type: "STRING", description: "Payment amount in rupees" },
                  customerPhone: { type: "STRING", description: "Recipient mobile number" },
                },
                required: ["amountInr", "customerPhone"],
              },
              behavior: "NON_BLOCKING",
            },
          ],
        },
      ],
    };

    if (useExtendedThinking) {
      liveConfig.thinkingConfig = {
        thinkingLevel: "low",
      };
    }

    try {
      const session = await this.ai.live.connect({
        model,
        config: liveConfig,
        callbacks: {
          onopen: () => {
            console.log(`[Gemini Live Gateway] Live session connected: ${model}`);
          },
          onmessage: (response: any) => {
            const content = response.serverContent;
            if (!content) return;

            // 1. Process Audio Output chunks
            if (content.modelTurn?.parts) {
              for (const part of content.modelTurn.parts) {
                if (part.inlineData?.data) {
                  callbacks.onAudioChunk?.(part.inlineData.data);
                }
              }
            }

            // 2. Real-time Transcripts
            if (content.inputTranscription?.text) {
              callbacks.onTranscription?.(content.inputTranscription.text, true);
            }
            if (content.outputTranscription?.text) {
              callbacks.onTranscription?.(content.outputTranscription.text, false);
            }

            // 3. User interruption handling (Push-to-Talk or VAD)
            if (content.interrupted) {
              callbacks.onInterrupted?.();
            }
          },
          onerror: (error: any) => {
            console.error("[Gemini Live Gateway Error]", error);
            callbacks.onError?.(error);
          },
          onclose: () => {
            console.log("[Gemini Live Gateway] Live session closed");
            callbacks.onClose?.();
          },
        },
      });

      return session;
    } catch (err) {
      console.error("[Gemini Live Gateway Connect Failure]", err);
      throw err;
    }
  }
}

export const geminiLiveGateway = new GeminiLiveGateway();
