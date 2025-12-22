<p align="center">
  <img src="https://github.com/user-attachments/assets/5a41b510-7120-4c63-a680-3800c46ab139" alt="PIG - Personal Invoice Generator" width="100%" />
</p>

<h1 align="center">🐷 PIG</h1>
<p align="center">
  <strong>Personal Invoice Generator</strong><br>
  A beautiful, modern desktop app for generating professional invoices with automated scheduling, AI-powered document analysis, and integrated email delivery.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#template-placeholders">Placeholders</a> •
  <a href="#license">License</a>
</p>

---

## ✨ Features

- **Modern UI** — Beautiful light and dark themes with a responsive design
- **ODT Template System** — Use LibreOffice/OpenOffice templates with placeholder substitution
- **Automated Scheduling** — Define billing rules with flexible periodicity (monthly, quarterly, yearly, custom)
- **AI-Powered Analysis** — Automatically extract amounts from receipts/invoices using Claude, GPT-4, or Gemini
- **Email Integration** — Compose and send invoices directly via SMTP with rich HTML templates
- **Multi-Currency** — Support for CZK, EUR, and USD with automatic exchange rate conversion
- **File Management** — Track and manage "proplatit" (to-reimburse) files with automatic processing
- **Secure Storage** — SMTP credentials and API keys are encrypted on disk

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ 
- [Rust](https://rustup.rs/) (for Tauri)
- [LibreOffice](https://www.libreoffice.org/) (for ODT → PDF conversion)

### Build from Source

```bash
# Clone the repository
git clone https://github.com/lofcz/pig.git
cd pig

# Install dependencies
npm i

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Usage

### Quick Start

1. **Configure your settings** — Set up your company details, customers, and bank account
2. **Create a ruleset** — Define billing periodicity, salary rules, and invoice templates
3. **Add extra items** — Drop receipts/invoices into the "proplatit" folder for reimbursement tracking
4. **Generate invoices** — Review pending invoices and generate them all at once
5. **Send emails** — Compose and send invoices to customers with attached PDFs

### Workflow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Configure      │ ──► │  Generate       │ ──► │  Send via       │
│  Rulesets       │     │  Invoices       │     │  Email          │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
   Salary rules          ODT → PDF             SMTP integration
   Periodicity           Preview mode          HTML templates
   Customer mapping      Batch generation      Attachments
```

## Configuration

### Directory Structure

```
your-invoice-root/
├── 24/                    # Year folder (invoices by year)
│   ├── faktura_*.odt
│   └── faktura_*.pdf
├── 25/
├── proplaceni/
│   └── proplatit/         # Files to reimburse
│   └── proplaceno/        # Processed files (auto-moved)
└── pig_template.odt       # Your invoice template
```

### Settings

| Section | Description |
|---------|-------------|
| **General** | Root path, LibreOffice path, currency settings, theme |
| **Suppliers** | Your company details (name, address, IČ, DIČ, bank account) |
| **Customers** | Client companies to invoice |
| **Contacts** | Contact persons for email delivery |
| **E-mails** | SMTP connectors and HTML email templates |
| **Rulesets** | Billing rules, periodicity, salary schedules |

### Rulesets

Rulesets define when and how invoices are generated:

- **Periodicity**: Monthly, Quarterly, Yearly, or Custom intervals
- **Entitlement Day**: Day of month when billing period closes
- **Salary Rules**: Date ranges with base value and deductions
- **Invoice Splitting**: Automatically split large invoices (e.g., max 80,000 CZK)
- **Customer Rules**: Map customers based on odd/even months or default

## Template Placeholders

PIG uses two types of placeholders: **Invoice Placeholders** for ODT templates and **Email Placeholders** for email templates.

### Invoice Template Placeholders (ODT)

Use these in your LibreOffice/OpenOffice invoice templates:

#### Invoice Details

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{P_NO}}` | Invoice number | `15012501` |
| `{{P_ISSUED}}` | Issue date | `15. 1. 2025` |
| `{{P_DUZP}}` | Date of taxable supply | `15. 1. 2025` |
| `{{P_DUE}}` | Due date | `29. 1. 2025` |
| `{{P_VS}}` | Variable symbol | `15012501` |
| `{{P_DESC}}` | Invoice description | `Services` |
| `{{P_VALUE}}` | Invoice amount (formatted) | `50 000,00` |
| `{{P_VAT}}` | VAT rate | `0%` |

#### Supplier (Your Company)

| Placeholder | Description |
|-------------|-------------|
| `{{P_SUPPLIER}}` | Full supplier block (multi-line) |
| `{{P_SUP_NAME}}` | Company name |
| `{{P_SUP_STREET}}` | Street address |
| `{{P_SUP_ZIP}}` | ZIP/Postal code |
| `{{P_SUP_CITY}}` | City |
| `{{P_SUP_COUNTRY}}` | Country |
| `{{P_SUP_IC}}` | Company ID |
| `{{P_SUP_DIC}}` | VAT ID |
| `{{P_ACC}}` | Bank account number |

#### Customer

| Placeholder | Description |
|-------------|-------------|
| `{{P_CUSTOMER}}` | Full customer block (multi-line) |
| `{{P_CUST_NAME}}` | Company name |
| `{{P_CUST_STREET}}` | Street address |
| `{{P_CUST_ZIP}}` | ZIP/Postal code |
| `{{P_CUST_CITY}}` | City |
| `{{P_CUST_COUNTRY}}` | Country |
| `{{P_CUST_IC}}` | Company ID |
| `{{P_CUST_DIC}}` | VAT ID |

### Email Template Placeholders

Use these in email subjects and bodies. Supports both `{{placeholder}}` syntax and full [Eta template](https://eta.js.org/) syntax for advanced logic.

#### Contact

| Placeholder | Description |
|-------------|-------------|
| `{{contact.name}}` | Contact person's name |
| `{{contact.email}}` | Contact email |
| `{{contact.phone}}` | Contact phone |

#### Single Invoice

| Placeholder | Description |
|-------------|-------------|
| `{{invoice.number}}` | Invoice number |
| `{{invoice.date}}` | Issue date |
| `{{invoice.dueDate}}` | Due date |
| `{{invoice.amount}}` | Amount (number) |
| `{{invoice.currency}}` | Currency code |
| `{{invoice.description}}` | Description |

#### Multiple Invoices

| Placeholder | Description |
|-------------|-------------|
| `{{invoices.count}}` | Number of invoices |
| `{{invoices.totalAmount}}` | Sum of all amounts |
| `{{invoices.numbers}}` | Comma-separated invoice numbers |

#### Customer

| Placeholder | Description |
|-------------|-------------|
| `{{customer.name}}` | Company name |
| `{{customer.street}}` | Street address |
| `{{customer.city}}` | City |
| `{{customer.zip}}` | ZIP code |
| `{{customer.country}}` | Country |
| `{{customer.ic}}` | Company ID |
| `{{customer.dic}}` | VAT ID |

#### Supplier

| Placeholder | Description |
|-------------|-------------|
| `{{supplier.name}}` | Company name |
| `{{supplier.street}}` | Street address |
| `{{supplier.city}}` | City |
| `{{supplier.zip}}` | ZIP code |
| `{{supplier.country}}` | Country |
| `{{supplier.ic}}` | Company ID |
| `{{supplier.dic}}` | VAT ID |
| `{{supplier.bankAccount}}` | Bank account |

#### Advanced Eta Syntax

Email templates support full Eta templating for complex scenarios:

```html
<!-- Loop through invoices -->
<% it.invoices.list.forEach(function(inv) { %>
  <p>Invoice #<%= inv.number %> - <%= it.formatAmount(inv.amount, inv.currency) %></p>
<% }) %>

<!-- Conditional content -->
<% if (it.invoices.count > 1) { %>
  <p>Please find <%= it.invoices.count %> invoices attached.</p>
<% } else { %>
  <p>Please find the invoice attached.</p>
<% } %>

<!-- Czech pluralization -->
<p>
  Posílám <%= it.invoices.count %> 
  <%= it.plural(it.invoices.count, 'fakturu', 'faktury', 'faktur') %>
</p>

<!-- Format amounts -->
<p>Total: <%= it.formatAmount(it.invoices.totalAmount, 'CZK') %></p>
```

## AI Document Analysis

PIG can automatically extract amounts from receipts and invoices using AI vision models.

### Supported Providers

Configure API keys in Settings → General → API Keys:

| Provider | Default Model |
|----------|-------|
| **Anthropic** | Claude 4.5 Haiku |
| **OpenAI** | GPT-4o |
| **Google** | Gemini 3 Flash Preview | 

### Supported File Types

- PDF documents
- Images: PNG, JPG, JPEG, GIF, WebP

### How It Works

1. Place receipts in the `proplatit` folder
2. Click the **Analyze** button in the Extra Items section
3. AI extracts amounts and currencies automatically
4. Review and adjust values as needed
5. Generate invoice — files are moved to `proplaceno`

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Rust, Tauri

## License

This library is licensed under the MIT license. 💜