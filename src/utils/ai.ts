/**
 * AI Service Layer
 * 
 * Direct SDK integration for AI providers.
 * Supports:
 * - Simple text requests
 * - Structured JSON output with schema validation
 * - Tools with structured input/output
 * - File/image inputs (multimodal)
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z, type ZodType } from 'zod';
import { loadAPIKeys, APIKeysConfig } from './apiKeys';

// ============================================
// Types
// ============================================

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama';

export interface AIConfig {
  provider: AIProvider;
  model?: string;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  data: string; // base64
  mimeType?: string;
}

export interface DocumentContent {
  type: 'document';
  data: string; // base64
  mimeType?: string;
}

export type ContentPart = TextContent | ImageContent | DocumentContent;

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
}

export interface ToolConfig<TInput extends ZodType, TOutput extends ZodType> {
  name: string;
  description: string;
  inputSchema: TInput;
  outputSchema?: TOutput;
  execute: (input: z.infer<TInput>) => Promise<z.infer<TOutput>> | z.infer<TOutput>;
}

// Simple schema types for structured output
export type SchemaType = 'object' | 'string' | 'number' | 'boolean' | 'array';

export interface SchemaProperty {
  type: SchemaType;
  description?: string;
  enum?: string[];
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

export interface OutputSchema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
  required?: string[];
}

export interface StructuredOutputConfig<T extends ZodType> {
  name: string;
  description?: string;
  schema: T;
  /** Provider-agnostic schema definition */
  outputSchema?: OutputSchema;
}

/** Convert our schema to OpenAI format (lowercase types) */
function toOpenAISchema(schema: OutputSchema): Record<string, unknown> {
  const convertProperty = (prop: SchemaProperty): Record<string, unknown> => {
    const result: Record<string, unknown> = { type: prop.type };
    if (prop.description) result.description = prop.description;
    if (prop.enum) result.enum = prop.enum;
    if (prop.items) result.items = convertProperty(prop.items);
    if (prop.properties) {
      result.properties = Object.fromEntries(
        Object.entries(prop.properties).map(([k, v]) => [k, convertProperty(v)])
      );
    }
    if (prop.required) result.required = prop.required;
    return result;
  };
  
  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, convertProperty(v)])
    ),
    required: schema.required,
    additionalProperties: false,
  };
}

/** Convert our schema to Gemini format (uppercase types) */
function toGeminiSchema(schema: OutputSchema): Record<string, unknown> {
  const typeMap: Record<SchemaType, string> = {
    object: 'OBJECT',
    string: 'STRING',
    number: 'NUMBER',
    boolean: 'BOOLEAN',
    array: 'ARRAY',
  };
  
  const convertProperty = (prop: SchemaProperty): Record<string, unknown> => {
    const result: Record<string, unknown> = { type: typeMap[prop.type] };
    if (prop.description) result.description = prop.description;
    if (prop.enum) result.enum = prop.enum;
    if (prop.items) result.items = convertProperty(prop.items);
    if (prop.properties) {
      result.properties = Object.fromEntries(
        Object.entries(prop.properties).map(([k, v]) => [k, convertProperty(v)])
      );
    }
    if (prop.required) result.required = prop.required;
    return result;
  };
  
  return {
    type: 'OBJECT',
    properties: Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, convertProperty(v)])
    ),
    required: schema.required,
  };
}

export interface AIRequestOptions<TOutput extends ZodType = ZodType<string>> {
  messages: Message[];
  systemPrompt?: string;
  structuredOutput?: StructuredOutputConfig<TOutput>;
  tools?: ToolConfig<any, any>[];
  temperature?: number;
  maxTokens?: number;
}

export interface AIResponse<T = string> {
  content: T;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============================================
// Default Models
// ============================================

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-haiku-4-5',
  gemini: 'gemini-3-flash-preview',
  ollama: 'llama3',
};

/** Get the model to use for a provider, checking custom overrides first */
function getModelForProvider(provider: AIProvider, apiKeys: APIKeysConfig | null): string {
  if (!apiKeys) return DEFAULT_MODELS[provider];
  
  switch (provider) {
    case 'openai':
      return apiKeys.openaiModel || DEFAULT_MODELS.openai;
    case 'anthropic':
      return apiKeys.anthropicModel || DEFAULT_MODELS.anthropic;
    case 'gemini':
      return apiKeys.geminiModel || DEFAULT_MODELS.gemini;
    case 'ollama':
      return apiKeys.ollama?.model || DEFAULT_MODELS.ollama;
    default:
      return DEFAULT_MODELS[provider];
  }
}

// ============================================
// Zod to JSON Schema Conversion
// ============================================

function zodToJsonSchema(schema: ZodType<any, any, any>): Record<string, any> {
  const typeName = schema._def.typeName;
  
  if (typeName === 'ZodObject') {
    const shape = (schema as z.ZodObject<any>).shape;
    const properties: Record<string, any> = {};
    const required: string[] = [];
    
    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as ZodType;
      properties[key] = zodToJsonSchema(fieldSchema);
      
      if (!(fieldSchema as any).isOptional?.()) {
        required.push(key);
      }
    }
    
    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: false,
    };
  }
  
  if (typeName === 'ZodString') return { type: 'string' };
  if (typeName === 'ZodNumber') return { type: 'number' };
  if (typeName === 'ZodBoolean') return { type: 'boolean' };
  
  if (typeName === 'ZodArray') {
    const itemSchema = (schema as z.ZodArray<any>).element;
    return { type: 'array', items: zodToJsonSchema(itemSchema) };
  }
  
  if (typeName === 'ZodOptional') {
    return zodToJsonSchema((schema as z.ZodOptional<any>).unwrap());
  }
  
  if (typeName === 'ZodNullable') {
    const inner = zodToJsonSchema((schema as z.ZodNullable<any>).unwrap());
    return { ...inner, nullable: true };
  }
  
  if (typeName === 'ZodEnum') {
    const values = (schema as z.ZodEnum<any>).options;
    return { type: 'string', enum: values };
  }
  
  if (typeName === 'ZodLiteral') {
    const value = (schema as z.ZodLiteral<any>).value;
    return { type: typeof value, const: value };
  }
  
  return { type: 'string' };
}

// ============================================
// Main AI Service Class
// ============================================

export class AIService {
  private apiKeys: APIKeysConfig | null = null;
  private _config: AIConfig;
  
  constructor(config: AIConfig) {
    this._config = config;
  }
  
  get provider(): AIProvider {
    return this._config.provider;
  }
  
  get model(): string | undefined {
    return this._config.model;
  }
  
  async init(): Promise<void> {
    this.apiKeys = await loadAPIKeys();
  }
  
  /**
   * Initialize with provided API keys (for testing without saving)
   */
  initWithKeys(keys: APIKeysConfig): void {
    this.apiKeys = keys;
  }
  
  isAvailable(): boolean {
    if (!this.apiKeys) return false;
    
    switch (this._config.provider) {
      case 'openai': return !!this.apiKeys.openai;
      case 'anthropic': return !!this.apiKeys.anthropic;
      case 'gemini': return !!this.apiKeys.gemini;
      case 'ollama': return !!this.apiKeys.ollama?.model;
      default: return false;
    }
  }
  
  getAvailableProviders(): AIProvider[] {
    if (!this.apiKeys) return [];
    
    const providers: AIProvider[] = [];
    if (this.apiKeys.openai) providers.push('openai');
    if (this.apiKeys.anthropic) providers.push('anthropic');
    if (this.apiKeys.gemini) providers.push('gemini');
    if (this.apiKeys.ollama?.model) providers.push('ollama');
    
    return providers;
  }
  
  async request(prompt: string, options?: Partial<AIRequestOptions>): Promise<AIResponse<string>> {
    return this.requestWithOptions({
      messages: [{ role: 'user', content: prompt }],
      ...options,
    });
  }
  
  async requestStructured<T extends ZodType>(
    prompt: string | Message[],
    schema: StructuredOutputConfig<T>,
    options?: Partial<Omit<AIRequestOptions, 'structuredOutput' | 'messages'>>
  ): Promise<AIResponse<z.infer<T>>> {
    const messages = typeof prompt === 'string' 
      ? [{ role: 'user' as const, content: prompt }]
      : prompt;
    
    return this.requestWithOptions({
      messages,
      structuredOutput: schema,
      ...options,
    }) as Promise<AIResponse<z.infer<T>>>;
  }
  
  async requestWithTools<T = string>(
    prompt: string | Message[],
    tools: ToolConfig<any, any>[],
    options?: Partial<Omit<AIRequestOptions, 'tools' | 'messages'>>
  ): Promise<AIResponse<T>> {
    const messages = typeof prompt === 'string'
      ? [{ role: 'user' as const, content: prompt }]
      : prompt;
    
    return this.requestWithOptions({
      messages,
      tools,
      ...options,
    }) as Promise<AIResponse<T>>;
  }
  
  async requestWithOptions<TOutput extends ZodType = ZodType<string>>(
    options: AIRequestOptions<TOutput>
  ): Promise<AIResponse<z.infer<TOutput>>> {
    if (!this.apiKeys) {
      throw new Error('AI service not initialized. Call init() first.');
    }
    
    const model = this._config.model || getModelForProvider(this._config.provider, this.apiKeys);
    
    switch (this._config.provider) {
      case 'openai':
        return this.requestOpenAI(model, options);
      case 'anthropic':
        return this.requestAnthropic(model, options);
      case 'gemini':
        return this.requestGemini(model, options);
      case 'ollama':
        return this.requestOllama(model, options);
      default:
        throw new Error(`Unknown provider: ${this._config.provider}`);
    }
  }
  
  // ============================================
  // OpenAI Implementation
  // ============================================
  
  private async requestOpenAI<TOutput extends ZodType>(
    model: string,
    options: AIRequestOptions<TOutput>
  ): Promise<AIResponse<z.infer<TOutput>>> {
    if (!this.apiKeys?.openai) throw new Error('OpenAI API key not configured');
    
    const client = new OpenAI({
      apiKey: this.apiKeys.openai,
      dangerouslyAllowBrowser: true,
    });
    
    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    
    for (const msg of options.messages) {
      if (typeof msg.content === 'string') {
        messages.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        });
      } else {
        const parts: OpenAI.ChatCompletionContentPart[] = msg.content.map(part => {
          if (part.type === 'text') {
            return { type: 'text' as const, text: part.text };
          } else if (part.type === 'image') {
            return {
              type: 'image_url' as const,
              image_url: {
                url: `data:${part.mimeType || 'image/png'};base64,${part.data}`,
              },
            };
          } else if (part.type === 'document') {
            // OpenAI supports file content parts for PDFs and other documents
            return {
              type: 'file' as const,
              file: {
                file_data: `data:${part.mimeType || 'application/pdf'};base64,${part.data}`,
                filename: 'document' + (part.mimeType === 'application/pdf' ? '.pdf' : ''),
              },
            } as unknown as OpenAI.ChatCompletionContentPart;
          }
          return { type: 'text' as const, text: '' };
        });
        
        messages.push({ role: 'user' as const, content: parts });
      }
    }
    
    const params: OpenAI.ChatCompletionCreateParams = {
      model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    };
    
    if (options.structuredOutput) {
      const schema = options.structuredOutput.outputSchema 
        ? toOpenAISchema(options.structuredOutput.outputSchema)
        : zodToJsonSchema(options.structuredOutput.schema);
      params.response_format = {
        type: 'json_schema',
        json_schema: {
          name: options.structuredOutput.name,
          description: options.structuredOutput.description,
          strict: true,
          schema,
        },
      };
    }
    
    if (options.tools?.length) {
      params.tools = options.tools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: zodToJsonSchema(tool.inputSchema),
        },
      }));
    }
    
    const response = await client.chat.completions.create(params);
    const content = response.choices[0]?.message?.content || '';
    
    if (options.structuredOutput) {
      const parsed = JSON.parse(content);
      const validated = options.structuredOutput.schema.parse(parsed);
      return {
        content: validated,
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
      };
    }
    
    return {
      content: content as z.infer<TOutput>,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
    };
  }
  
  // ============================================
  // Anthropic Implementation
  // ============================================
  
  private async requestAnthropic<TOutput extends ZodType>(
    model: string,
    options: AIRequestOptions<TOutput>
  ): Promise<AIResponse<z.infer<TOutput>>> {
    if (!this.apiKeys?.anthropic) throw new Error('Anthropic API key not configured');
    
    const client = new Anthropic({
      apiKey: this.apiKeys.anthropic,
      dangerouslyAllowBrowser: true,
    });
    
    const messages: Anthropic.MessageParam[] = [];
    let systemPrompt = options.systemPrompt || '';
    
    for (const msg of options.messages) {
      if (msg.role === 'system') {
        if (typeof msg.content === 'string') {
          systemPrompt = systemPrompt ? `${systemPrompt}\n${msg.content}` : msg.content;
        }
        continue;
      }
      
      if (typeof msg.content === 'string') {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      } else {
        const parts: Anthropic.ContentBlockParam[] = msg.content
          .map(part => {
            if (part.type === 'text') {
              return { type: 'text' as const, text: part.text };
            } else if (part.type === 'image') {
              return {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: (part.mimeType || 'image/png') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                  data: part.data,
                },
              };
            } else if (part.type === 'document') {
              // Anthropic supports documents (PDFs) via document content blocks
              return {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: part.mimeType || 'application/pdf',
                  data: part.data,
                },
              } as any;
            }
            return null;
          })
          .filter((p): p is Anthropic.ContentBlockParam => p !== null);
        
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: parts,
        });
      }
    }
    
    const params: Anthropic.MessageCreateParams = {
      model,
      messages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature,
      system: systemPrompt || undefined,
    };
    
    if (options.tools?.length) {
      params.tools = options.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: zodToJsonSchema(tool.inputSchema) as Anthropic.Tool.InputSchema,
      }));
    }
    
    // Use structured outputs beta if outputSchema is provided
    let response;
    if (options.structuredOutput?.outputSchema) {
      response = await client.beta.messages.create({
        ...params,
        betas: ['structured-outputs-2025-11-13'],
        output_format: {
          type: 'json_schema',
          schema: toOpenAISchema(options.structuredOutput.outputSchema), // Anthropic uses same format as OpenAI
        },
      } as any);
    } else {
      response = await client.messages.create(params);
    }
    
    let content = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      }
    }
    
    if (options.structuredOutput) {
      const parsed = JSON.parse(content);
      const validated = options.structuredOutput.schema.parse(parsed);
      return {
        content: validated,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    }
    
    return {
      content: content as z.infer<TOutput>,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
  
  // ============================================
  // Gemini Implementation
  // ============================================
  
  private async requestGemini<TOutput extends ZodType>(
    model: string,
    options: AIRequestOptions<TOutput>
  ): Promise<AIResponse<z.infer<TOutput>>> {
    if (!this.apiKeys?.gemini) throw new Error('Gemini API key not configured');
    
    const genAI = new GoogleGenerativeAI(this.apiKeys.gemini);
    const geminiModel = genAI.getGenerativeModel({ model });
    
    // Combine system prompt with first user message if present
    let systemPrompt = options.systemPrompt || '';
    for (const msg of options.messages) {
      if (msg.role === 'system' && typeof msg.content === 'string') {
        systemPrompt = systemPrompt ? `${systemPrompt}\n${msg.content}` : msg.content;
      }
    }
    
    // Build prompt parts for simple single-turn request
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    
    if (systemPrompt) {
      parts.push({ text: systemPrompt + '\n\n' });
    }
    
    for (const msg of options.messages) {
      if (msg.role === 'system') continue;
      
      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else {
        for (const part of msg.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          } else if (part.type === 'image' || part.type === 'document') {
            // Gemini supports both images and documents (like PDFs) via inlineData
            parts.push({
              inlineData: {
                mimeType: part.mimeType || 'application/octet-stream',
                data: part.data,
              },
            });
          }
        }
      }
    }
    
    const generationConfig: Record<string, unknown> = {};
    if (options.temperature !== undefined) {
      generationConfig.temperature = options.temperature;
    }
    if (options.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = options.maxTokens;
    }
    if (options.structuredOutput) {
      generationConfig.responseMimeType = 'application/json';
      if (options.structuredOutput.outputSchema) {
        generationConfig.responseSchema = toGeminiSchema(options.structuredOutput.outputSchema);
      }
    }
    
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: parts as any }],
      generationConfig: generationConfig as any,
    });
    
    const content = result.response.text();
    
    if (options.structuredOutput) {
      const parsed = JSON.parse(content);
      const validated = options.structuredOutput.schema.parse(parsed);
      return {
        content: validated,
        usage: result.response.usageMetadata ? {
          promptTokens: result.response.usageMetadata.promptTokenCount || 0,
          completionTokens: result.response.usageMetadata.candidatesTokenCount || 0,
          totalTokens: result.response.usageMetadata.totalTokenCount || 0,
        } : undefined,
      };
    }
    
    return {
      content: content as z.infer<TOutput>,
      usage: result.response.usageMetadata ? {
        promptTokens: result.response.usageMetadata.promptTokenCount || 0,
        completionTokens: result.response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: result.response.usageMetadata.totalTokenCount || 0,
      } : undefined,
    };
  }
  
  // ============================================
  // Ollama Implementation
  // ============================================
  
  private async requestOllama<TOutput extends ZodType>(
    _model: string,
    options: AIRequestOptions<TOutput>
  ): Promise<AIResponse<z.infer<TOutput>>> {
    if (!this.apiKeys?.ollama?.model) throw new Error('Ollama model not configured');
    
    const host = this.apiKeys.ollama.host || 'http://localhost:11434';
    const model = this.apiKeys.ollama.model;
    
    // Build messages
    const messages: { role: string; content: string; images?: string[] }[] = [];
    
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    
    for (const msg of options.messages) {
      if (typeof msg.content === 'string') {
        messages.push({ role: msg.role, content: msg.content });
      } else {
        let text = '';
        const images: string[] = [];
        
        for (const part of msg.content) {
          if (part.type === 'text') {
            text += part.text;
          } else if (part.type === 'image') {
            images.push(part.data);
          }
        }
        
        messages.push({
          role: msg.role,
          content: text,
          ...(images.length ? { images } : {}),
        });
      }
    }
    
    const body: any = {
      model,
      messages,
      stream: false,
    };
    
    if (options.temperature !== undefined) {
      body.options = { ...body.options, temperature: options.temperature };
    }
    if (options.maxTokens !== undefined) {
      body.options = { ...body.options, num_predict: options.maxTokens };
    }
    if (options.structuredOutput) {
      body.format = 'json';
    }
    
    const response = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    const content = data.message?.content || '';
    
    if (options.structuredOutput) {
      const parsed = JSON.parse(content);
      const validated = options.structuredOutput.schema.parse(parsed);
      return {
        content: validated,
        usage: data.eval_count ? {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        } : undefined,
      };
    }
    
    return {
      content: content as z.infer<TOutput>,
      usage: data.eval_count ? {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      } : undefined,
    };
  }
}

// ============================================
// Factory Functions
// ============================================

export function createAIService(config: AIConfig): AIService {
  return new AIService(config);
}

export async function createInitializedAIService(config: AIConfig): Promise<AIService> {
  const service = new AIService(config);
  await service.init();
  return service;
}

export async function getAvailableAIService(): Promise<AIService | null> {
  const apiKeys = await loadAPIKeys();
  
  const providers: AIProvider[] = ['openai', 'anthropic', 'gemini', 'ollama'];
  
  for (const provider of providers) {
    const service = new AIService({ provider });
    service.initWithKeys(apiKeys);
    
    if (service.isAvailable()) {
      return service;
    }
  }
  
  return null;
}

// ============================================
// Helper: Create Tool
// ============================================

export function createTool<
  TInput extends ZodType,
  TOutput extends ZodType
>(config: ToolConfig<TInput, TOutput>): ToolConfig<TInput, TOutput> {
  return config;
}

// ============================================
// Re-export zod for convenience
// ============================================

export { z } from 'zod';
