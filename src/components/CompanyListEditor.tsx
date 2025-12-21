import { useRef, useMemo } from 'react';
import { CompanyDetails, Contact } from '../types';
import {
  Building2,
  CreditCard,
  Plus,
  Trash2,
  Mail
} from 'lucide-react';
import { Select, findOption } from './Select';

interface CompanyListEditorProps {
  companies: CompanyDetails[];
  contacts?: Contact[];
  onAdd: () => void;
  onUpdate: (id: string, c: CompanyDetails) => void;
  onRemove: (id: string) => void;
  title: string;
  emptyMessage: string;
}

export function CompanyListEditor({ companies, contacts, onAdd, onUpdate, onRemove, title, emptyMessage }: CompanyListEditorProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 
            className="text-lg font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h3>
          <p 
            className="text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            {companies.length} {title.toLowerCase()} configured
          </p>
        </div>
        <button onClick={onAdd} className="btn btn-success">
          <Plus size={18} />
          <span>Add {title === 'Suppliers' ? 'Supplier' : 'Customer'}</span>
        </button>
      </div>

      {companies.length === 0 ? (
        <div 
          className="p-8 rounded-lg text-center"
          style={{ backgroundColor: 'var(--bg-muted)' }}
        >
          <Building2 size={48} className="mx-auto mb-3" style={{ color: 'var(--text-subtle)' }} />
          <p style={{ color: 'var(--text-muted)' }}>{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {companies.map((c) => (
            <CompanyCard 
              key={c.id} 
              company={c}
              contacts={contacts}
              onUpdate={onUpdate}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CompanyCardProps {
  company: CompanyDetails;
  contacts?: Contact[];
  onUpdate: (id: string, c: CompanyDetails) => void;
  onRemove: (id: string) => void;
}

function CompanyCard({ company, contacts, onUpdate, onRemove }: CompanyCardProps) {
  // Use refs for all inputs - completely bypasses React rendering on keystroke
  const nameRef = useRef<HTMLInputElement>(null);
  const streetRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const countryRef = useRef<HTMLInputElement>(null);
  const icRef = useRef<HTMLInputElement>(null);
  const dicRef = useRef<HTMLInputElement>(null);
  const bankRef = useRef<HTMLInputElement>(null);
  const contactIdRef = useRef<string | undefined>(company.contactId);
  
  const contactOptions = useMemo(() => {
    if (!contacts || company.isSupplier) return [];
    return contacts.map(c => ({ value: c.id, label: `${c.name} (${c.email})` }));
  }, [contacts, company.isSupplier]);

  // Commit all current values to parent
  const commitChanges = () => {
    onUpdate(company.id, {
      ...company,
      name: nameRef.current?.value ?? company.name,
      street: streetRef.current?.value ?? company.street,
      city: cityRef.current?.value ?? company.city,
      zip: zipRef.current?.value ?? company.zip,
      country: countryRef.current?.value ?? company.country,
      ic: icRef.current?.value ?? company.ic,
      dic: dicRef.current?.value || undefined,
      bankAccount: bankRef.current?.value || undefined,
      contactId: contactIdRef.current,
    });
  };

  const handleContactChange = (opt: { value: string } | null) => {
    contactIdRef.current = opt?.value || undefined;
    commitChanges();
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="badge badge-primary">
            {company.id}
          </span>
        </div>
        <button 
          onClick={() => onRemove(company.id)} 
          className="btn btn-ghost btn-icon"
          style={{ color: 'var(--error-500)' }}
        >
          <Trash2 size={18} />
        </button>
      </div>
      
      <div>
        <label 
          className="text-xs font-semibold uppercase tracking-wide mb-1 block"
          style={{ color: 'var(--text-muted)' }}
        >
          Company Name
        </label>
        <input 
          ref={nameRef}
          defaultValue={company.name}
          onBlur={commitChanges}
          placeholder="Company Name"
        />
      </div>

      <div>
        <label 
          className="text-xs font-semibold uppercase tracking-wide mb-1 block"
          style={{ color: 'var(--text-muted)' }}
        >
          Street Address
        </label>
        <input 
          ref={streetRef}
          defaultValue={company.street}
          onBlur={commitChanges}
          placeholder="Street and number"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label 
            className="text-xs font-semibold uppercase tracking-wide mb-1 block"
            style={{ color: 'var(--text-muted)' }}
          >
            City
          </label>
          <input 
            ref={cityRef}
            defaultValue={company.city}
            onBlur={commitChanges}
            placeholder="City"
          />
        </div>
        <div>
          <label 
            className="text-xs font-semibold uppercase tracking-wide mb-1 block"
            style={{ color: 'var(--text-muted)' }}
          >
            ZIP
          </label>
          <input 
            ref={zipRef}
            defaultValue={company.zip}
            onBlur={commitChanges}
            placeholder="ZIP"
          />
        </div>
      </div>

      <div>
        <label 
          className="text-xs font-semibold uppercase tracking-wide mb-1 block"
          style={{ color: 'var(--text-muted)' }}
        >
          Country
        </label>
        <input 
          ref={countryRef}
          defaultValue={company.country}
          onBlur={commitChanges}
          placeholder="Country"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label 
            className="text-xs font-semibold uppercase tracking-wide mb-1 block"
            style={{ color: 'var(--text-muted)' }}
          >
            IČ (Company ID)
          </label>
          <input 
            ref={icRef}
            defaultValue={company.ic}
            onBlur={commitChanges}
            placeholder="12345678"
          />
        </div>
        <div>
          <label 
            className="text-xs font-semibold uppercase tracking-wide mb-1 block"
            style={{ color: 'var(--text-muted)' }}
          >
            DIČ (VAT ID)
          </label>
          <input 
            ref={dicRef}
            defaultValue={company.dic || ''}
            onBlur={commitChanges}
            placeholder="CZ12345678"
          />
        </div>
      </div>

      {company.isSupplier && (
        <div>
          <label 
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide mb-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <CreditCard size={14} />
            Bank Account
          </label>
          <input 
            ref={bankRef}
            defaultValue={company.bankAccount || ''}
            onBlur={commitChanges}
            placeholder="123456789 / 0100"
          />
        </div>
      )}

      {!company.isSupplier && contacts && (
        <div>
          <label 
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide mb-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <Mail size={14} />
            Contact Person
          </label>
          <Select
            value={findOption(contactOptions, company.contactId)}
            onChange={handleContactChange}
            options={contactOptions}
            placeholder="No contact assigned"
            isClearable
            isSearchable={false}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>
            Assigned contact for automated emails
          </p>
        </div>
      )}
    </div>
  );
}
