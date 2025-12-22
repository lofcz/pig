import { useState, useEffect, forwardRef, useImperativeHandle, useCallback, useRef } from 'react';
import { loadAPIKeys, saveAPIKeys, APIKeysConfig, API_PROVIDERS, ProviderId, DEFAULT_PROVIDER_ORDER, getProviderOrder } from '../utils/apiKeys';
import { AIService, AIProvider } from '../utils/ai';
import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';
import { toast } from 'sonner';
import {
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  Server,
  Sparkles,
  Trash2,
  GripVertical
} from 'lucide-react';
import { InfoBox } from './InfoBox';

export interface APIKeysEditorRef {
  save: () => Promise<void>;
  isDirty: () => boolean;
}

interface APIKeysEditorProps {
  rootPath: string;
  onVisibilityChange?: (isVisible: boolean) => void;
}

export const APIKeysEditor = forwardRef<APIKeysEditorRef, APIKeysEditorProps>(
  function APIKeysEditor({ rootPath }, ref) {
    const [apiKeys, setApiKeys] = useState<APIKeysConfig>({});
    const [isLoaded, setIsLoaded] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [providerOrder, setProviderOrder] = useState<ProviderId[]>(DEFAULT_PROVIDER_ORDER);

    // Load API keys on mount or when rootPath changes
    useEffect(() => {
      if (rootPath) {
        loadAPIKeys(rootPath).then(keys => {
          setApiKeys(keys);
          setProviderOrder(getProviderOrder(keys));
          setIsLoaded(true);
        });
      }
    }, [rootPath]);

    // Expose save method to parent
    useImperativeHandle(ref, () => ({
      save: async () => {
        if (isDirty && rootPath) {
          await saveAPIKeys(rootPath, { ...apiKeys, providerOrder });
          setIsDirty(false);
        }
      },
      isDirty: () => isDirty,
    }));

    const updateKey = useCallback((provider: keyof Omit<APIKeysConfig, 'ollama' | 'providerOrder'>, value: string) => {
      setApiKeys(prev => ({ ...prev, [provider]: value || undefined }));
      setIsDirty(true);
    }, []);

    const updateModel = useCallback((provider: 'openai' | 'anthropic' | 'gemini', value: string) => {
      const modelKey = `${provider}Model` as 'openaiModel' | 'anthropicModel' | 'geminiModel';
      setApiKeys(prev => ({ ...prev, [modelKey]: value || undefined }));
      setIsDirty(true);
    }, []);

    const updateOllama = useCallback((field: 'model' | 'host', value: string) => {
      setApiKeys(prev => ({
        ...prev,
        ollama: {
          model: field === 'model' ? value : (prev.ollama?.model || ''),
          host: field === 'host' ? (value || undefined) : prev.ollama?.host
        }
      }));
      setIsDirty(true);
    }, []);

    const handleDragEnd = useCallback((event: any) => {
      if (event.canceled) return;
      
      setProviderOrder(prev => {
        const newOrder = move(prev, event);
        if (newOrder !== prev) {
          setIsDirty(true);
          return newOrder as ProviderId[];
        }
        return prev;
      });
    }, []);

    const getProviderById = useCallback((id: string) => {
      return providerOrder.find(p => p === id);
    }, [providerOrder]);

    if (!isLoaded) {
      return (
        <div 
          className="p-4 rounded-lg"
          style={{ backgroundColor: 'var(--bg-muted)' }}
        >
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
            Loading API keys...
          </div>
        </div>
      );
    }

    return (
      <div 
        className="p-5 rounded-xl space-y-4"
        style={{ backgroundColor: 'var(--bg-muted)' }}
      >
        <div className="flex items-center gap-2">
          <Key size={16} style={{ color: 'var(--accent-500)' }} />
          <h3 
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            API Keys
          </h3>
          <span 
            className="px-1.5 py-0.5 rounded text-xs font-medium"
            style={{ 
              backgroundColor: 'var(--accent-100)', 
              color: 'var(--accent-700)' 
            }}
          >
            BYOK
          </span>
        </div>
        
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Configure AI provider API keys. Drag to reorder priority (top = first to try).
        </p>

        <div className="space-y-2">
          <DragDropProvider onDragEnd={handleDragEnd}>
            {providerOrder.map((providerId, index) => (
              providerId === 'ollama' ? (
                <SortableOllamaInput
                  key={providerId}
                  id={providerId}
                  index={index}
                  value={apiKeys.ollama}
                  onChange={updateOllama}
                  apiKeys={apiKeys}
                />
              ) : (
                <SortableAPIKeyInput
                  key={providerId}
                  id={providerId}
                  index={index}
                  provider={providerId as Exclude<ProviderId, 'ollama'>}
                  value={apiKeys[providerId] || ''}
                  onChange={(val) => updateKey(providerId as any, val)}
                  modelValue={apiKeys[`${providerId}Model` as 'openaiModel' | 'anthropicModel' | 'geminiModel'] || ''}
                  onModelChange={(val) => updateModel(providerId as 'openai' | 'anthropic' | 'gemini', val)}
                  apiKeys={apiKeys}
                />
              )
            ))}
            <DragOverlay>
              {(source) => {
                const providerId = getProviderById(source.id as string);
                if (!providerId) return null;
                return <ProviderGhost providerId={providerId} apiKeys={apiKeys} />;
              }}
            </DragOverlay>
          </DragDropProvider>
        </div>

        <InfoBox icon={<Sparkles size={16} />}>
          API keys are encrypted before being saved to disk.
        </InfoBox>
      </div>
    );
  }
);

// Unified provider card component - used by both interactive and ghost versions
interface ProviderCardProps {
  providerId: ProviderId;
  apiKeys: APIKeysConfig;
  disabled?: boolean;
  isGhost?: boolean;
  isDragging?: boolean;
  // Refs for drag handle
  containerRef?: React.Ref<HTMLDivElement>;
  handleRef?: React.Ref<HTMLElement>;
  onDragHandlePointerDown?: () => void;
  // For API key providers (not Ollama)
  keyInputRef?: React.RefObject<HTMLInputElement | null>;
  modelInputRef?: React.RefObject<HTMLInputElement | null>;
  isKeyVisible?: boolean;
  onKeyVisibilityToggle?: () => void;
  onKeyChange?: () => void;
  onKeyBlur?: () => void;
  onModelBlur?: () => void;
  onKeyTest?: () => void;
  onKeyClear?: () => void;
  keyTesting?: boolean;
  // For Ollama
  ollamaModelRef?: React.RefObject<HTMLInputElement | null>;
  ollamaHostRef?: React.RefObject<HTMLInputElement | null>;
  onOllamaModelBlur?: () => void;
  onOllamaHostBlur?: () => void;
  onOllamaTest?: () => void;
  ollamaTesting?: boolean;
}

function ProviderCard({
  providerId,
  apiKeys,
  disabled = false,
  isGhost = false,
  isDragging = false,
  containerRef,
  handleRef,
  onDragHandlePointerDown,
  keyInputRef,
  modelInputRef,
  isKeyVisible = false,
  onKeyVisibilityToggle,
  onKeyChange,
  onKeyBlur,
  onModelBlur,
  onKeyTest,
  onKeyClear,
  keyTesting = false,
  ollamaModelRef,
  ollamaHostRef,
  onOllamaModelBlur,
  onOllamaHostBlur,
  onOllamaTest,
  ollamaTesting = false,
}: ProviderCardProps) {
  const info = API_PROVIDERS[providerId];
  const isOllama = providerId === 'ollama';
  const Icon = isOllama ? Server : Key;
  
  const keyValue = isOllama ? '' : (apiKeys[providerId] || '');
  const modelValue = isOllama ? '' : (apiKeys[`${providerId}Model` as 'openaiModel' | 'anthropicModel' | 'geminiModel'] || '');
  const hasKeyValue = isOllama ? !!apiKeys.ollama?.model : !!keyValue;

  return (
    <div 
      ref={containerRef}
      className={`p-3 rounded-lg overflow-hidden ${isGhost ? 'shadow-xl' : ''}`}
      style={{ 
        backgroundColor: 'var(--bg-surface)',
        opacity: isDragging ? 0.5 : 1
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div 
          ref={handleRef as React.Ref<HTMLDivElement>}
          className={`drag-handle ${isGhost ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ color: 'var(--text-muted)' }}
          onPointerDown={onDragHandlePointerDown}
        >
          <GripVertical size={18} />
        </div>
        <Icon size={16} style={{ color: 'var(--accent-500)' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {info.name}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {info.description}
        </span>
        {disabled ? (
          <div className="ml-auto p-1" style={{ color: 'var(--text-muted)' }}>
            <ExternalLink size={14} />
          </div>
        ) : (
          <a
            href={info.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="Get API key"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {/* Body */}
      {isOllama ? (
        <div className="flex gap-2 ml-7 min-w-0">
          <div className="flex-1 min-w-0">
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
              Model Name
            </label>
            <input
              ref={ollamaModelRef}
              type="text"
              defaultValue={apiKeys.ollama?.model || ''}
              onBlur={onOllamaModelBlur}
              placeholder={info.placeholder}
              className="text-sm w-full"
              disabled={disabled}
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
              Host URL
              {!disabled && <span className="font-normal" style={{ color: 'var(--text-subtle)' }}> (optional)</span>}
            </label>
            <input
              ref={ollamaHostRef}
              type="text"
              defaultValue={apiKeys.ollama?.host || ''}
              onBlur={onOllamaHostBlur}
              placeholder="http://localhost:11434"
              className="text-sm w-full"
              disabled={disabled}
            />
          </div>
          {hasKeyValue && !disabled && (
            <div className="flex items-end flex-shrink-0">
              <button
                onClick={onOllamaTest}
                disabled={ollamaTesting}
                className="btn btn-ghost btn-icon"
                style={{ color: 'var(--accent-500)' }}
                title="Test Ollama connection"
              >
                <Sparkles size={16} className={ollamaTesting ? 'animate-pulse' : ''} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-2 ml-7 items-center">
          <div className="relative flex-[2] min-w-[120px]">
            <input
              ref={keyInputRef}
              type={isKeyVisible ? 'text' : 'password'}
              defaultValue={keyValue}
              onChange={onKeyChange}
              onBlur={onKeyBlur}
              placeholder={info.placeholder}
              className="w-full text-sm font-mono"
              style={{ paddingRight: '32px' }}
              autoComplete="new-password"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              disabled={disabled}
            />
            <button
              type="button"
              onClick={onKeyVisibilityToggle}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title={isKeyVisible ? 'Hide key' : 'Show key'}
              disabled={disabled}
            >
              {isKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <input
            ref={modelInputRef}
            type="text"
            defaultValue={modelValue}
            onBlur={onModelBlur}
            placeholder={info.defaultModel}
            className="text-sm flex-1 min-w-[100px]"
            title={`Custom model (default: ${info.defaultModel})`}
            disabled={disabled}
          />
          {hasKeyValue && (
            <>
              <button
                onClick={onKeyTest}
                disabled={disabled || keyTesting}
                className="btn btn-ghost btn-icon"
                style={{ color: 'var(--accent-500)' }}
                title="Test API key"
              >
                <Sparkles size={16} className={keyTesting ? 'animate-pulse' : ''} />
              </button>
              <button
                onClick={onKeyClear}
                disabled={disabled}
                className="btn btn-ghost btn-icon"
                style={{ color: 'var(--error-500)' }}
                title="Clear key"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Ghost component for drag overlay - just renders ProviderCard as disabled
function ProviderGhost({ providerId, apiKeys }: { providerId: ProviderId; apiKeys: APIKeysConfig }) {
  return <ProviderCard providerId={providerId} apiKeys={apiKeys} disabled isGhost />;
}

interface SortableAPIKeyInputProps {
  id: string;
  index: number;
  provider: Exclude<ProviderId, 'ollama'>;
  value: string;
  onChange: (value: string) => void;
  modelValue: string;
  onModelChange: (value: string) => void;
  apiKeys: APIKeysConfig;
}

function SortableAPIKeyInput({ id, index, provider, value, onChange, modelValue, onModelChange, apiKeys }: SortableAPIKeyInputProps) {
  const { ref, handleRef, isDragging } = useSortable({ id, index });
  const info = API_PROVIDERS[provider];
  const inputRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [testing, setTesting] = useState(false);
  
  const commitValue = useCallback(() => {
    const newValue = inputRef.current?.value || '';
    if (newValue !== value) {
      onChange(newValue);
    }
  }, [value, onChange]);

  const commitModelValue = useCallback(() => {
    const newValue = modelRef.current?.value || '';
    if (newValue !== modelValue) {
      onModelChange(newValue);
    }
  }, [modelValue, onModelChange]);
  
  const handleClear = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    onChange('');
  };

  const handleTest = async () => {
    const currentValue = inputRef.current?.value || '';
    const currentModel = modelRef.current?.value || '';
    const modelKey = `${provider}Model` as 'openaiModel' | 'anthropicModel' | 'geminiModel';
    const testKeys: APIKeysConfig = { ...apiKeys, [provider]: currentValue, [modelKey]: currentModel || undefined };
    
    setTesting(true);
    try {
      const ai = new AIService({ provider: provider as AIProvider });
      ai.initWithKeys(testKeys);
      
      const response = await ai.request('reply just yes', { maxTokens: 100 });
      toast.success(`${info.name}: ${response.content}`);
    } catch (e) {
      toast.error(`${info.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTesting(false);
    }
  };
  
  const handleDragHandlePointerDown = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };
  
  return (
    <ProviderCard
      providerId={provider}
      apiKeys={{ ...apiKeys, [provider]: inputRef.current?.value ?? value }}
      isDragging={isDragging}
      containerRef={ref}
      handleRef={handleRef}
      onDragHandlePointerDown={handleDragHandlePointerDown}
      keyInputRef={inputRef}
      modelInputRef={modelRef}
      isKeyVisible={isVisible}
      onKeyVisibilityToggle={() => setIsVisible(!isVisible)}
      onKeyBlur={commitValue}
      onModelBlur={commitModelValue}
      onKeyTest={handleTest}
      onKeyClear={handleClear}
      keyTesting={testing}
    />
  );
}

interface SortableOllamaInputProps {
  id: string;
  index: number;
  value: APIKeysConfig['ollama'];
  onChange: (field: 'model' | 'host', value: string) => void;
  apiKeys: APIKeysConfig;
}

function SortableOllamaInput({ id, index, value, onChange, apiKeys }: SortableOllamaInputProps) {
  const { ref, handleRef, isDragging } = useSortable({ id, index });
  const [testing, setTesting] = useState(false);
  const modelRef = useRef<HTMLInputElement>(null);
  const hostRef = useRef<HTMLInputElement>(null);
  
  const handleTest = async () => {
    const currentModel = modelRef.current?.value || value?.model;
    if (!currentModel) return;
    
    setTesting(true);
    try {
      const testKeys: APIKeysConfig = {
        ...apiKeys,
        ollama: {
          model: currentModel,
          host: hostRef.current?.value || value?.host
        }
      };
      const service = new AIService({ provider: 'ollama' });
      service.initWithKeys(testKeys);
      
      const response = await service.request('reply just yes', { maxTokens: 100 });
      
      if (response.content.toLowerCase().includes('yes')) {
        toast.success(`Ollama: Connected successfully!`);
      } else {
        toast.success(`Ollama: Got response: "${response.content.slice(0, 50)}..."`);
      }
    } catch (e) {
      toast.error(`Ollama: ${e instanceof Error ? e.message : 'Connection failed'}`);
    } finally {
      setTesting(false);
    }
  };
  
  const handleModelBlur = () => {
    if (modelRef.current && modelRef.current.value !== (value?.model || '')) {
      onChange('model', modelRef.current.value);
    }
  };
  
  const handleHostBlur = () => {
    if (hostRef.current && hostRef.current.value !== (value?.host || '')) {
      onChange('host', hostRef.current.value);
    }
  };
  
  const handleDragHandlePointerDown = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };
  
  return (
    <ProviderCard
      providerId="ollama"
      apiKeys={apiKeys}
      isDragging={isDragging}
      containerRef={ref}
      handleRef={handleRef}
      onDragHandlePointerDown={handleDragHandlePointerDown}
      ollamaModelRef={modelRef}
      ollamaHostRef={hostRef}
      onOllamaModelBlur={handleModelBlur}
      onOllamaHostBlur={handleHostBlur}
      onOllamaTest={handleTest}
      ollamaTesting={testing}
    />
  );
}
