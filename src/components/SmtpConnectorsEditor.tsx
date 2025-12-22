import { useState, useRef } from 'react';
import { EmailConnector } from '../types';
import { testSmtpConnection } from '../utils/email';
import { toast } from 'sonner';
import { InfoBox } from './InfoBox';
import {
  Plus,
  Trash2,
  Server,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Zap,
  Loader2,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

interface SmtpConnectorsEditorProps {
  connectors: EmailConnector[];
  onAdd: () => void;
  onUpdate: (id: string, connector: EmailConnector) => void;
  onRemove: (id: string) => void;
  hideHeader?: boolean;
}

export function SmtpConnectorsEditor({
  connectors,
  onAdd,
  onUpdate,
  onRemove,
  hideHeader = false,
}: SmtpConnectorsEditorProps) {
  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="flex justify-between items-center">
          <div>
            <h3
              className="text-lg font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              SMTP Connectors
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {connectors.length} connector{connectors.length !== 1 ? 's' : ''}{' '}
              configured
            </p>
          </div>
          <button onClick={onAdd} className="btn btn-success">
            <Plus size={18} />
            <span>Add Connector</span>
          </button>
        </div>
      )}

      {connectors.length === 0 ? (
        <div
          className="p-8 rounded-lg text-center"
          style={{ backgroundColor: 'var(--bg-muted)' }}
        >
          <Server
            size={48}
            className="mx-auto mb-3"
            style={{ color: 'var(--text-subtle)' }}
          />
          <p style={{ color: 'var(--text-muted)' }}>
            No SMTP connectors configured. Add an SMTP connector to send emails
            directly from the app.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {connectors.map((connector) => (
            <SmtpConnectorCard
              key={connector.id}
              connector={connector}
              onChange={(updated) => onUpdate(connector.id, updated)}
              onRemove={() => onRemove(connector.id)}
            />
          ))}
        </div>
      )}

      <InfoBox icon={<ShieldCheck size={16} />}>
        SMTP passwords are encrypted before being saved to disk.
      </InfoBox>

      {/* Help Section */}
      <div
        className="p-4 rounded-lg space-y-4"
        style={{
          backgroundColor: 'var(--bg-muted)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div>
          <h4
            className="font-semibold mb-2 flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <Zap size={16} />
            Gmail Quick Setup
          </h4>
          <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <p>To use Gmail for sending emails:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Enable 2-Factor Authentication on your Google account</li>
              <li>
                Go to{' '}
                <code
                  className="px-1.5 py-0.5 rounded text-xs"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--accent-600)',
                  }}
                >
                  myaccount.google.com → Security → App passwords
                </code>
              </li>
              <li>Create a new app password and use it as your SMTP password</li>
            </ol>
            <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>
                  Recommended Settings
                </span>
                <div className="space-y-0.5">
                  <p>Host: <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-surface)' }}>smtp.gmail.com</code></p>
                  <p>Port: <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-surface)' }}>587</code> (TLS) or <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-surface)' }}>465</code> (SSL)</p>
                  <p>Username: Your full Gmail address</p>
                </div>
              </div>
              <div>
                <span className="font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>
                  Other Providers
                </span>
                <div className="space-y-0.5">
                  <p>Outlook: <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-surface)' }}>smtp.office365.com:587</code></p>
                  <p>Yahoo: <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-surface)' }}>smtp.mail.yahoo.com:587</code></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SmtpConnectorCardProps {
  connector: EmailConnector;
  onChange: (connector: EmailConnector) => void;
  onRemove: () => void;
}

function SmtpConnectorCard({ connector, onChange, onRemove }: SmtpConnectorCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  // Use refs for performance (avoid re-renders on each keystroke)
  const nameRef = useRef<HTMLInputElement>(null);
  const hostRef = useRef<HTMLInputElement>(null);
  const portRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const fromEmailRef = useRef<HTMLInputElement>(null);
  const fromNameRef = useRef<HTMLInputElement>(null);
  const secureRef = useRef<boolean>(connector.secure);

  const commitChanges = () => {
    onChange({
      ...connector,
      name: nameRef.current?.value ?? connector.name,
      host: hostRef.current?.value ?? connector.host,
      port: parseInt(portRef.current?.value || '587', 10),
      username: usernameRef.current?.value ?? connector.username,
      password: passwordRef.current?.value ?? connector.password,
      fromEmail: fromEmailRef.current?.value ?? connector.fromEmail,
      fromName: fromNameRef.current?.value || undefined,
      secure: secureRef.current,
    });
  };

  const handleSecureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    secureRef.current = e.target.checked;
    // Auto-adjust port based on secure mode
    if (portRef.current) {
      if (e.target.checked && portRef.current.value === '587') {
        portRef.current.value = '465';
      } else if (!e.target.checked && portRef.current.value === '465') {
        portRef.current.value = '587';
      }
    }
    commitChanges();
  };

  const applyGmailPreset = () => {
    if (hostRef.current) hostRef.current.value = 'smtp.gmail.com';
    if (portRef.current) portRef.current.value = '587';
    secureRef.current = false;
    commitChanges();
  };

  const handleTestConnection = async () => {
    // Commit current values first
    commitChanges();
    
    setIsTesting(true);
    try {
      // Build connector from current refs
      const currentConnector: EmailConnector = {
        ...connector,
        name: nameRef.current?.value ?? connector.name,
        host: hostRef.current?.value ?? connector.host,
        port: parseInt(portRef.current?.value || '587', 10),
        username: usernameRef.current?.value ?? connector.username,
        password: passwordRef.current?.value ?? connector.password,
        fromEmail: fromEmailRef.current?.value ?? connector.fromEmail,
        fromName: fromNameRef.current?.value || undefined,
        secure: secureRef.current,
      };
      
      const result = await testSmtpConnection(currentConnector);
      if (result.success) {
        toast.success(result.message);
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        style={{ backgroundColor: 'var(--bg-muted)' }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <Server size={20} style={{ color: 'var(--accent-500)' }} />
          <div>
            <span className="badge badge-primary mr-2">{connector.id}</span>
            <span
              className="font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {connector.name || 'Unnamed Connector'}
            </span>
            {connector.host && (
              <span
                className="ml-2 text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                ({connector.host}:{connector.port})
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="btn btn-ghost btn-icon"
            style={{ color: 'var(--error-500)' }}
          >
            <Trash2 size={18} />
          </button>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                className="text-xs font-semibold uppercase tracking-wide mb-1 block"
                style={{ color: 'var(--text-muted)' }}
              >
                Connector Name
              </label>
              <input
                ref={nameRef}
                defaultValue={connector.name}
                onBlur={commitChanges}
                placeholder="My Gmail"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={applyGmailPreset}
                className="btn btn-secondary"
              >
                <Zap size={16} />
                <span>Gmail Preset</span>
              </button>
            </div>
          </div>

          <div
            className="pt-4"
            style={{ borderTop: '1px solid var(--border-default)' }}
          >
            <h5
              className="text-sm font-semibold mb-3"
              style={{ color: 'var(--text-secondary)' }}
            >
              Server Settings
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label
                  className="text-xs font-semibold uppercase tracking-wide mb-1 block"
                  style={{ color: 'var(--text-muted)' }}
                >
                  SMTP Host
                </label>
                <input
                  ref={hostRef}
                  defaultValue={connector.host}
                  onBlur={commitChanges}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div>
                <label
                  className="text-xs font-semibold uppercase tracking-wide mb-1 block"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Port
                </label>
                <input
                  ref={portRef}
                  type="number"
                  defaultValue={connector.port || 587}
                  onBlur={commitChanges}
                  placeholder="587"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked={connector.secure}
                  onChange={handleSecureChange}
                  className="rounded"
                />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Use SSL/TLS (port 465)
                </span>
                <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                  — Uncheck for STARTTLS (port 587, recommended for Gmail)
                </span>
              </label>
            </div>
          </div>

          <div
            className="pt-4"
            style={{ borderTop: '1px solid var(--border-default)' }}
          >
            <h5
              className="text-sm font-semibold mb-3"
              style={{ color: 'var(--text-secondary)' }}
            >
              Authentication
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  className="text-xs font-semibold uppercase tracking-wide mb-1 block"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Username (Email)
                </label>
                <input
                  ref={usernameRef}
                  type="email"
                  defaultValue={connector.username}
                  onBlur={commitChanges}
                  placeholder="your.email@gmail.com"
                />
              </div>
              <div>
                <label
                  className="text-xs font-semibold uppercase tracking-wide mb-1 block"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Password (App Password)
                </label>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    defaultValue={connector.password}
                    onBlur={commitChanges}
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            className="pt-4"
            style={{ borderTop: '1px solid var(--border-default)' }}
          >
            <h5
              className="text-sm font-semibold mb-3"
              style={{ color: 'var(--text-secondary)' }}
            >
              Sender Info
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  className="text-xs font-semibold uppercase tracking-wide mb-1 block"
                  style={{ color: 'var(--text-muted)' }}
                >
                  From Email
                </label>
                <input
                  ref={fromEmailRef}
                  type="email"
                  defaultValue={connector.fromEmail}
                  onBlur={commitChanges}
                  placeholder="your.email@gmail.com"
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>
                  Usually same as username
                </p>
              </div>
              <div>
                <label
                  className="text-xs font-semibold uppercase tracking-wide mb-1 block"
                  style={{ color: 'var(--text-muted)' }}
                >
                  From Name{' '}
                  <span className="font-normal normal-case" style={{ color: 'var(--text-subtle)' }}>
                    (optional)
                  </span>
                </label>
                <input
                  ref={fromNameRef}
                  defaultValue={connector.fromName || ''}
                  onBlur={commitChanges}
                  placeholder="Your Company Name"
                />
              </div>
            </div>
          </div>

          {/* Test Connection Button */}
          <div
            className="pt-4 flex justify-end"
            style={{ borderTop: '1px solid var(--border-default)' }}
          >
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="btn btn-secondary"
            >
              {isTesting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Test Connection</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

