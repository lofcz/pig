/**
 * AI-powered analysis of extra items (proplatit files)
 * Extracts paid amounts and currencies from invoices/receipts
 */

import { readFile } from '@tauri-apps/plugin-fs';
import { z } from 'zod';
import { AIService, AIProvider, Message, ContentPart, OutputSchema } from './ai';
import { loadAPIKeys, getProviderOrder, isProviderConfigured } from './apiKeys';

// Schema for extracted payment info
export const PaymentInfoSchema = z.object({
  paidAmount: z.number(),
  paidCurrency: z.enum(['CZK', 'EUR', 'USD']),
});

export type PaymentInfo = z.infer<typeof PaymentInfoSchema>;

// Unified schema definition (converted per-provider automatically)
const PAYMENT_INFO_OUTPUT_SCHEMA: OutputSchema = {
  type: 'object',
  properties: {
    paidAmount: {
      type: 'number',
      description: 'The total amount paid or billed',
    },
    paidCurrency: {
      type: 'string',
      enum: ['CZK', 'EUR', 'USD'],
      description: 'The currency of the payment',
    },
  },
  required: ['paidAmount', 'paidCurrency'],
};

// System prompt for extraction
const EXTRACTION_SYSTEM_PROMPT = `You are an invoice and receipt analyzer. Your task is to extract the total paid or billed amount from documents.

Guidelines:
- Look for the TOTAL amount, not individual line items
- If there are multiple totals (subtotal, tax, grand total), use the GRAND TOTAL
- Extract the currency from the document
- If the currency is Czech Koruna/Crowns, use "CZK"
- If the currency is Euro/€, use "EUR"  
- If the currency is US Dollar/$, use "USD"
- If the currency is unclear but the document appears to be Czech, default to "CZK"
- Return the amount as a number (no formatting, no currency symbols)
- If you cannot determine the amount, return 0`;

export interface AnalysisResult {
  success: boolean;
  paymentInfo?: PaymentInfo;
  error?: string;
}

export interface AnalysisProgress {
  completed: number;
  total: number;
  current?: string;
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Convert Uint8Array to base64 string (chunked to avoid stack overflow)
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Process in chunks to avoid stack overflow with large files
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Check if file type is supported for AI analysis
 */
function isSupportedFileType(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  return ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '');
}

/**
 * Analyze a single file with AI
 */
async function analyzeFile(
  filePath: string,
  fileName: string,
  aiService: AIService
): Promise<AnalysisResult> {
  try {
    if (!isSupportedFileType(fileName)) {
      const error = `Unsupported file type: ${fileName}`;
      console.warn(`[AI Analysis] ${error}`);
      return {
        success: false,
        error,
      };
    }

    console.log(`[AI Analysis] Analyzing: ${fileName}`);

    // Read file as binary and convert to base64
    const fileData = await readFile(filePath);
    const bytes = new Uint8Array(fileData);
    const base64 = uint8ArrayToBase64(bytes);
    const mimeType = getMimeType(fileName);

    console.log(`[AI Analysis] File size: ${fileData.length} bytes, MIME: ${mimeType}, base64 length: ${base64.length}`);

    // Build message with file attachment
    const contentParts: ContentPart[] = [
      { type: 'text', text: `Please analyze this document (${fileName}) and extract the total paid/billed amount and currency.` },
    ];

    // Add as image or document based on type
    if (mimeType.startsWith('image/')) {
      contentParts.push({
        type: 'image',
        data: base64,
        mimeType,
      });
    } else {
      contentParts.push({
        type: 'document',
        data: base64,
        mimeType,
      });
    }

    const messages: Message[] = [
      { role: 'user', content: contentParts },
    ];

    const response = await aiService.requestStructured(
      messages,
      {
        name: 'payment_info',
        description: 'Extracted payment information from the document',
        schema: PaymentInfoSchema,
        outputSchema: PAYMENT_INFO_OUTPUT_SCHEMA,
      },
      {
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        maxTokens: 500,
      }
    );

    console.log(`[AI Analysis] Success for ${fileName}:`, response.content);

    return {
      success: true,
      paymentInfo: response.content,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[AI Analysis] Error for ${fileName}:`, error, e);
    return {
      success: false,
      error,
    };
  }
}

/**
 * Analyze multiple files with concurrency control
 */
export async function analyzeExtraItems(
  items: Array<{ filePath: string; fileName: string; index: number }>,
  options: {
    concurrency?: number;
    onProgress?: (progress: AnalysisProgress) => void;
    onItemComplete?: (index: number, result: AnalysisResult) => void;
  } = {}
): Promise<Map<number, AnalysisResult>> {
  const { concurrency = 8, onProgress, onItemComplete } = options;
  const results = new Map<number, AnalysisResult>();

  // Load API keys and find available provider
  const apiKeys = await loadAPIKeys();
  const providerOrder = getProviderOrder(apiKeys);
  
  let selectedProvider: AIProvider | null = null;
  for (const provider of providerOrder) {
    if (isProviderConfigured(apiKeys, provider)) {
      selectedProvider = provider;
      break;
    }
  }

  if (!selectedProvider) {
    // No provider available - return error for all items
    for (const item of items) {
      const result: AnalysisResult = {
        success: false,
        error: 'No AI provider configured',
      };
      results.set(item.index, result);
      onItemComplete?.(item.index, result);
    }
    return results;
  }

  // Create AI service
  const aiService = new AIService({ provider: selectedProvider });
  aiService.initWithKeys(apiKeys);

  // Process items with concurrency limit
  let completed = 0;
  const total = items.length;
  
  // Process in batches
  const processBatch = async (batch: typeof items) => {
    await Promise.all(
      batch.map(async (item) => {
        onProgress?.({
          completed,
          total,
          current: item.fileName,
        });

        const result = await analyzeFile(item.filePath, item.fileName, aiService);
        results.set(item.index, result);
        onItemComplete?.(item.index, result);

        completed++;
        onProgress?.({
          completed,
          total,
        });
      })
    );
  };

  // Split into batches and process
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await processBatch(batch);
  }

  return results;
}

/**
 * Check if AI analysis is available (any provider configured)
 */
export async function isAnalysisAvailable(): Promise<boolean> {
  const apiKeys = await loadAPIKeys();
  const providerOrder = getProviderOrder(apiKeys);
  
  for (const provider of providerOrder) {
    if (isProviderConfigured(apiKeys, provider)) {
      return true;
    }
  }
  
  return false;
}

