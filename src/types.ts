export interface CompanyDetails {
  id: string;
  name: string;
  street: string;
  city: string;
  zip: string;
  country: string;
  ic: string;
  dic?: string;
  isSupplier?: boolean;
}

export type PeriodicityType = 'monthly' | 'quarterly' | 'yearly' | 'custom_months' | 'custom_days';

export interface CustomerRule {
  companyId: string;
  condition: 'odd' | 'even' | 'default';
}

export interface SalaryRule {
  startDate: string; // YYYY-MM
  endDate: string; // YYYY-MM
  value: number;
  deduction: number;
}

export interface Ruleset {
  id: string;
  name: string;
  periodicity: PeriodicityType;
  periodicityCustomValue?: number;
  entitlementDay: number;
  dueDateOffsetDays?: number; // Days from current date for due date (default: 14)
  minimizeInvoices?: boolean;
  salaryRules: SalaryRule[];
  rules: CustomerRule[];
  descriptions: string[];
  templatePath?: string;
}

export type ThemePreference = 'light' | 'dark' | 'system';

export interface Config {
  rootPath: string;
  companies: CompanyDetails[];
  rulesets: Ruleset[];
  maxInvoiceValue: number;
  exchangeRates: {
    EUR: number;
    USD: number;
  };
  bankAccount: string;
  theme?: ThemePreference;
}

export const DEFAULT_CONFIG: Config = {
  rootPath: "C:\\Users\\lordo\\Documents\\BioWare\\pig",
  companies: [
    {
      id: "supplier",
      name: "Matěj Štágl",
      street: "Božice 115",
      city: "Znojmo",
      zip: "671 64",
      country: "Česká republika",
      ic: "08406049",
      isSupplier: true
    },
    {
      id: "scio_zizkov",
      name: "ScioŠkola Žižkov – střední škola, s.r.o.",
      street: "Prokopova 100/16, Žižkov",
      city: "Praha 3",
      zip: "130 00",
      country: "Česká republika",
      ic: "07116349"
    },
    {
      id: "scio_nusle",
      name: "ScioŠkola Praha Nusle - základní škola, s.r.o.",
      street: "Boleslavova 250/1, Nusle",
      city: "Praha 4",
      zip: "140 00",
      country: "Česká republika",
      ic: "07231881"
    }
  ],
  rulesets: [
    {
      id: "scio",
      name: "Scio",
      periodicity: "monthly",
      entitlementDay: 5,
      salaryRules: [
        {
          startDate: "2020-01",
          endDate: "2025-10",
          value: 106000,
          deduction: 0
        },
        {
          startDate: "2025-11",
          endDate: "2099-12",
          value: 143000,
          deduction: 7225
        }
      ],
      rules: [
        { condition: "odd", companyId: "scio_nusle" },
        { condition: "default", companyId: "scio_zizkov" }
      ],
      descriptions: [
        "Konzultační a programátorské služby na EduMap.",
        "Konzultační a programátorské služby na ScioBot",
        "Konzultační a programátorské služby na ScioStudium",
        "Konzultační a programátorské služby na ScioChat"
      ]
    }
  ],
  maxInvoiceValue: 90000,
  exchangeRates: {
    EUR: 25,
    USD: 23
  },
  bankAccount: "164182402 / 0600",
  theme: 'system'
};
