import { useState, useEffect } from 'react';
import { Config, CompanyDetails, SalaryRule, CustomerRule, Ruleset, PeriodicityType } from '../types';
import { saveConfig } from '../utils/config';
import { open } from '@tauri-apps/plugin-dialog';
import { exists } from '@tauri-apps/plugin-fs';

interface ConfigEditorProps {
  config: Config;
  onSave: (newConfig: Config) => void;
  onCancel: () => void;
}

export default function ConfigEditor({ config, onSave, onCancel }: ConfigEditorProps) {
  const [localConfig, setLocalConfig] = useState<Config>(JSON.parse(JSON.stringify(config)));
  const [activeTab, setActiveTab] = useState<'general' | 'supplier' | 'customers' | 'rulesets'>('general');

  const handleSave = async () => {
    try {
      await saveConfig(localConfig);
      onSave(localConfig);
    } catch (e) {
      alert("Failed to save config: " + e);
    }
  };

  const addCompany = (isSupplier: boolean) => {
    const id = prompt(`Enter unique ID for ${isSupplier ? 'Supplier' : 'Customer'} (e.g. 'scio_zizkov'):`);
    if (!id) return;
    if (localConfig.companies.find(c => c.id === id)) { alert("ID exists"); return; }
    
    const newC: CompanyDetails = { 
        id, 
        name: isSupplier ? "My Company" : "New Customer", 
        street: "", city: "", zip: "", country: "", ic: "", 
        isSupplier 
    };
    
    setLocalConfig(prev => ({
        ...prev,
        companies: [...prev.companies, newC]
    }));
  };

  const updateCompany = (id: string, newC: CompanyDetails) => {
      setLocalConfig(prev => ({
          ...prev,
          companies: prev.companies.map(c => c.id === id ? newC : c)
      }));
  };

  const removeCompany = (id: string) => {
      if (confirm("Delete company?")) {
          setLocalConfig(prev => ({
              ...prev,
              companies: prev.companies.filter(c => c.id !== id)
          }));
      }
  };

  const TabButton = ({ id, label }: { id: typeof activeTab, label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2 font-medium rounded-t-lg ${activeTab === id ? 'bg-white text-blue-600 border-t border-l border-r' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Settings</h2>
        <div className="space-x-4">
          <button onClick={onCancel} className="px-4 py-2 text-gray-600 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700">Save Changes</button>
        </div>
      </div>

      <div className="flex border-b mb-6">
        <TabButton id="general" label="General" />
        <TabButton id="supplier" label="Supplier" />
        <TabButton id="customers" label="Customers" />
        <TabButton id="rulesets" label="Rulesets" />
      </div>

      <div className="space-y-6">
        {activeTab === 'general' && (
          <div className="grid gap-6 max-w-2xl">
            <div>
              <PathInput 
                label="Root Directory"
                value={localConfig.rootPath}
                onChange={val => setLocalConfig({...localConfig, rootPath: val})}
                isDirectory
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account</label>
              <input
                type="text"
                value={localConfig.bankAccount}
                onChange={e => setLocalConfig({...localConfig, bankAccount: e.target.value})}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Invoice Value</label>
              <input
                type="number"
                value={localConfig.maxInvoiceValue}
                onChange={e => setLocalConfig({...localConfig, maxInvoiceValue: Number(e.target.value)})}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">EUR Rate</label>
                <input
                  type="number"
                  value={localConfig.exchangeRates.EUR}
                  onChange={e => setLocalConfig({...localConfig, exchangeRates: {...localConfig.exchangeRates, EUR: Number(e.target.value)}})}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">USD Rate</label>
                <input
                  type="number"
                  value={localConfig.exchangeRates.USD}
                  onChange={e => setLocalConfig({...localConfig, exchangeRates: {...localConfig.exchangeRates, USD: Number(e.target.value)}})}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'supplier' && (
          <CompanyListEditor 
            companies={localConfig.companies.filter(c => c.isSupplier)} 
            onAdd={() => addCompany(true)}
            onUpdate={updateCompany}
            onRemove={removeCompany}
            title="Suppliers"
          />
        )}

        {activeTab === 'customers' && (
          <CompanyListEditor 
            companies={localConfig.companies.filter(c => !c.isSupplier)} 
            onAdd={() => addCompany(false)}
            onUpdate={updateCompany}
            onRemove={removeCompany}
            title="Customers"
          />
        )}

        {activeTab === 'rulesets' && (
           <RulesetsEditor 
             rulesets={localConfig.rulesets}
             companies={localConfig.companies}
             onChange={rulesets => setLocalConfig({...localConfig, rulesets})}
           />
        )}
      </div>
    </div>
  );
}

// --- Sub-Editors ---

function PathInput({ value, onChange, isDirectory = false, label }: { value: string, onChange: (val: string) => void, isDirectory?: boolean, label: string }) {
    const [isValid, setIsValid] = useState<boolean | null>(null);

    useEffect(() => {
        if (!value) { setIsValid(null); return; }
        exists(value).then(setIsValid).catch(() => setIsValid(false));
    }, [value]);

    const handleBrowse = async () => {
        const selected = await open({
            directory: isDirectory,
            multiple: false,
            defaultPath: value || undefined,
            filters: isDirectory ? undefined : [{ name: 'ODT Template', extensions: ['odt'] }]
        });
        if (selected && typeof selected === 'string') {
            onChange(selected);
        }
    };

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 pr-8 ${isValid === false ? 'border-red-500 bg-red-50' : isValid === true ? 'border-green-500 bg-green-50' : ''}`}
                    />
                     <div className="absolute right-2 top-2">
                        {isValid === true && <span className="text-green-600 font-bold">✓</span>}
                        {isValid === false && <span className="text-red-600 font-bold" title="Path does not exist">⚠</span>}
                    </div>
                </div>
                <button onClick={handleBrowse} className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300">
                    📂
                </button>
            </div>
        </div>
    );
}

function CompanyListEditor({ companies, onAdd, onUpdate, onRemove, title }: { 
    companies: CompanyDetails[], 
    onAdd: () => void,
    onUpdate: (id: string, c: CompanyDetails) => void,
    onRemove: (id: string) => void,
    title: string
}) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onAdd} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">Add {title === 'Suppliers' ? 'Supplier' : 'Customer'}</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {companies.map((c) => (
          <CompanyCard 
            key={c.id} 
            company={c} 
            onChange={newC => onUpdate(c.id, newC)} 
            onRemove={() => onRemove(c.id)} 
          />
        ))}
      </div>
    </div>
  );
}

function CompanyCard({ company, onChange, onRemove }: { company: CompanyDetails, onChange: (c: CompanyDetails) => void, onRemove: () => void }) {
    const update = (field: keyof CompanyDetails, val: any) => onChange({ ...company, [field]: val });

    return (
        <div className="border p-4 rounded shadow-sm bg-gray-50 relative space-y-3">
            <button onClick={onRemove} className="absolute top-2 right-2 text-red-500 hover:text-red-700">✕</button>
            <h3 className="font-bold text-lg pr-6">{company.id}</h3>
            
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label>
                <input className="w-full p-2 border rounded" value={company.name} onChange={e => update('name', e.target.value)} />
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Street</label>
                <input className="w-full p-2 border rounded" value={company.street} onChange={e => update('street', e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">City</label>
                    <input className="w-full p-2 border rounded" value={company.city} onChange={e => update('city', e.target.value)} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ZIP</label>
                    <input className="w-full p-2 border rounded" value={company.zip} onChange={e => update('zip', e.target.value)} />
                </div>
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Country</label>
                <input className="w-full p-2 border rounded" value={company.country} onChange={e => update('country', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">IC</label>
                    <input className="w-full p-2 border rounded" value={company.ic} onChange={e => update('ic', e.target.value)} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">DIC (Optional)</label>
                    <input className="w-full p-2 border rounded" value={company.dic || ''} onChange={e => update('dic', e.target.value)} />
                </div>
            </div>
        </div>
    )
}

function RulesetsEditor({ rulesets, companies, onChange }: { rulesets: Ruleset[], companies: CompanyDetails[], onChange: (r: Ruleset[]) => void }) {
    const updateRuleset = (index: number, field: keyof Ruleset, value: any) => {
        const newR = [...rulesets];
        newR[index] = { ...newR[index], [field]: value };
        onChange(newR);
    };

    return (
        <div className="space-y-6">
            {rulesets.map((rs, i) => (
                <div key={rs.id} className="border p-4 rounded bg-gray-50 space-y-4">
                    <div className="flex justify-between">
                        <h3 className="font-bold text-xl">{rs.name}</h3>
                        <div className="text-sm text-gray-500">ID: {rs.id}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Periodicity</label>
                            <div className="flex gap-2">
                                <select 
                                    className="border p-1 rounded"
                                    value={rs.periodicity}
                                    onChange={e => updateRuleset(i, 'periodicity', e.target.value)}
                                >
                                    <option value="monthly">Monthly</option>
                                    <option value="quarterly">Quarterly</option>
                                    <option value="yearly">Yearly</option>
                                    <option value="custom_months">Custom (Months)</option>
                                    <option value="custom_days">Custom (Days)</option>
                                </select>
                                {(rs.periodicity === 'custom_months' || rs.periodicity === 'custom_days') && (
                                    <input 
                                        type="number" className="border p-1 rounded w-16" 
                                        value={rs.periodicityCustomValue || 1}
                                        onChange={e => updateRuleset(i, 'periodicityCustomValue', Number(e.target.value))}
                                    />
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Entitlement (Day of next period)</label>
                            <input 
                                type="number" className="border p-1 rounded w-full"
                                value={rs.entitlementDay}
                                onChange={e => updateRuleset(i, 'entitlementDay', Number(e.target.value))}
                            />
                        </div>
                    </div>
                    
                    <div>
                        <PathInput 
                            label="ODT Template Path"
                            value={rs.templatePath || ''}
                            onChange={val => updateRuleset(i, 'templatePath', val)}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <input 
                            type="checkbox" 
                            id={`min_inv_${i}`}
                            checked={!!rs.minimizeInvoices}
                            onChange={e => updateRuleset(i, 'minimizeInvoices', e.target.checked)}
                        />
                        <label htmlFor={`min_inv_${i}`} className="text-sm cursor-pointer select-none">
                            Minimize Invoice Count (Carry over remainders to minimize total invoices)
                        </label>
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="font-bold text-gray-700 mb-2">Customer Rules (Top → Bottom Priority)</h4>
                        <CustomerRulesEditor 
                            rules={rs.rules} 
                            companies={companies}
                            onChange={rules => updateRuleset(i, 'rules', rules)} 
                        />
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="font-bold text-gray-700 mb-2">Salary History</h4>
                        <SalaryEditor 
                            rules={rs.salaryRules}
                            onChange={rules => updateRuleset(i, 'salaryRules', rules)}
                        />
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="font-bold text-gray-700 mb-2">Service Descriptions</h4>
                        <DescriptionsEditor 
                            descriptions={rs.descriptions || []}
                            onChange={descs => updateRuleset(i, 'descriptions', descs)}
                        />
                    </div>
                </div>
            ))}
        </div>
    )
}

function CustomerRulesEditor({ rules, companies, onChange }: { rules: CustomerRule[], companies: CompanyDetails[], onChange: (r: CustomerRule[]) => void }) {
    const targets = companies.filter(c => !c.isSupplier); // Filter out suppliers

    const addRule = () => onChange([...rules, { condition: 'default', companyId: targets[0]?.id || '' }]);
    const removeRule = (idx: number) => {
        const newR = [...rules];
        newR.splice(idx, 1);
        onChange(newR);
    };
    const updateRule = (idx: number, field: keyof CustomerRule, val: any) => {
        const newR = [...rules];
        newR[idx] = { ...newR[idx], [field]: val };
        onChange(newR);
    };
    const moveRule = (idx: number, dir: -1 | 1) => {
        if (idx + dir < 0 || idx + dir >= rules.length) return;
        const newR = [...rules];
        const temp = newR[idx];
        newR[idx] = newR[idx + dir];
        newR[idx + dir] = temp;
        onChange(newR);
    };

    return (
        <div className="space-y-2">
            {rules.map((rule, i) => (
                <div key={i} className="flex gap-2 items-center bg-white p-2 border rounded">
                     <div className="flex flex-col gap-0.5">
                         <button onClick={() => moveRule(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-blue-500 disabled:opacity-30">▲</button>
                         <button onClick={() => moveRule(i, 1)} disabled={i === rules.length - 1} className="text-gray-400 hover:text-blue-500 disabled:opacity-30">▼</button>
                     </div>
                     <select 
                        className="border p-1 rounded w-32"
                        value={rule.condition}
                        onChange={e => updateRule(i, 'condition', e.target.value)}
                     >
                         <option value="odd">Odd Month</option>
                         <option value="even">Even Month</option>
                         <option value="default">Default (Always)</option>
                     </select>
                     <span>→</span>
                     <select 
                        className="border p-1 rounded flex-1"
                        value={rule.companyId}
                        onChange={e => updateRule(i, 'companyId', e.target.value)}
                     >
                         {targets.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                     </select>
                     <button onClick={() => removeRule(i)} className="text-red-500 px-2">✕</button>
                </div>
            ))}
            <button onClick={addRule} className="text-sm text-blue-600 hover:underline">+ Add Rule</button>
        </div>
    );
}

function SalaryEditor({ rules, onChange }: { rules: SalaryRule[], onChange: (r: SalaryRule[]) => void }) {
    const addRule = () => onChange([...rules, { startDate: "2025-01", endDate: "2025-12", value: 0, deduction: 0 }]);
    const removeRule = (i: number) => {
        const newR = [...rules];
        newR.splice(i, 1);
        onChange(newR);
    }
    const updateRule = (i: number, field: keyof SalaryRule, val: any) => {
        const newR = [...rules];
        newR[i] = { ...newR[i], [field]: val };
        onChange(newR);
    }

    return (
        <div className="space-y-2">
            <table className="w-full text-left border-collapse text-sm">
                <thead>
                    <tr className="bg-gray-100 border-b">
                        <th className="p-2">Start (YYYY-MM)</th>
                        <th className="p-2">End (YYYY-MM)</th>
                        <th className="p-2">Base Value</th>
                        <th className="p-2">Deduction</th>
                        <th className="p-2"></th>
                    </tr>
                </thead>
                <tbody>
                    {rules.map((r, i) => (
                        <tr key={i} className="border-b">
                            <td className="p-1"><input className="border p-1 rounded w-24" value={r.startDate} onChange={e => updateRule(i, 'startDate', e.target.value)} /></td>
                            <td className="p-1"><input className="border p-1 rounded w-24" value={r.endDate} onChange={e => updateRule(i, 'endDate', e.target.value)} /></td>
                            <td className="p-1"><input type="number" className="border p-1 rounded w-20" value={r.value} onChange={e => updateRule(i, 'value', Number(e.target.value))} /></td>
                            <td className="p-1"><input type="number" className="border p-1 rounded w-20" value={r.deduction} onChange={e => updateRule(i, 'deduction', Number(e.target.value))} /></td>
                            <td className="p-1"><button onClick={() => removeRule(i)} className="text-red-500 text-xs">Remove</button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <button onClick={addRule} className="text-sm text-blue-600 hover:underline">+ Add Period</button>
        </div>
    )
}

function DescriptionsEditor({ descriptions, onChange }: { descriptions: string[], onChange: (d: string[]) => void }) {
    const addDesc = () => onChange([...descriptions, "New Description"]);
    const removeDesc = (i: number) => {
        const newD = [...descriptions];
        newD.splice(i, 1);
        onChange(newD);
    }
    const updateDesc = (i: number, val: string) => {
        const newD = [...descriptions];
        newD[i] = val;
        onChange(newD);
    }

    return (
        <div className="space-y-2">
            <button onClick={addDesc} className="text-sm text-blue-600 hover:underline mb-2">+ Add Description</button>
            {descriptions.map((d, i) => (
                <div key={i} className="flex gap-2">
                    <input className="flex-1 border p-1 rounded text-sm" value={d} onChange={e => updateDesc(i, e.target.value)} />
                    <button onClick={() => removeDesc(i)} className="text-red-500 px-2">✕</button>
                </div>
            ))}
        </div>
    )
}
