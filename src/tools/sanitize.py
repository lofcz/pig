import zipfile
import os

TEMPLATE_PATH = 'src/templates/template.odt'
OUTPUT_PATH = 'src/templates/template_clean.odt'

def sanitize():
    with zipfile.ZipFile(TEMPLATE_PATH, 'r') as zin:
        with zipfile.ZipFile(OUTPUT_PATH, 'w') as zout:
            for item in zin.infolist():
                content = zin.read(item.filename)
                if item.filename == 'content.xml':
                    xml = content.decode('utf-8')
                    
                    # 1. Invoice No Title
                    xml = xml.replace(
                        '<text:span text:style-name="T2">FAKTURA - DAŇOVÝ DOKLAD č. 300</text:span><text:span text:style-name="T3">6</text:span><text:span text:style-name="T4">2025</text:span>',
                        '<text:span text:style-name="T2">FAKTURA - DAŇOVÝ DOKLAD č. {{INVOICE_NO}}</text:span>'
                    )
                    
                    # 2. Issue Date
                    # Day
                    xml = xml.replace(
                        '<text:span text:style-name="T16">3</text:span><text:span text:style-name="T17">0</text:span><text:span text:style-name="T18">.</text:span>',
                        '<text:span text:style-name="T16">{{ISSUE_DAY}}.</text:span>'
                    )
                    # Month Year
                    xml = xml.replace(
                        '<text:span text:style-name="T21">6</text:span><text:span text:style-name="T22">. 2025</text:span>',
                        '<text:span text:style-name="T21">{{ISSUE_MONTH_YEAR}}</text:span>'
                    )

                    # 3. DUZP
                    # Day (Note: extra space span in search)
                    xml = xml.replace(
                        '<text:span text:style-name="T29"><text:s text:c="2"/></text:span><text:span text:style-name="T30">30</text:span><text:span text:style-name="T31">.</text:span>',
                        '<text:span text:style-name="T30">{{DUZP_DAY}}.</text:span>'
                    )
                    # Month Year
                    xml = xml.replace(
                        '<text:span text:style-name="T34">6</text:span><text:span text:style-name="T35">. 2025</text:span>',
                        '<text:span text:style-name="T34">{{DUZP_MONTH_YEAR}}</text:span>'
                    )

                    # 4. Due Date
                    # Day
                    xml = xml.replace(
                        '<text:span text:style-name="T42">30</text:span><text:span text:style-name="T43">.</text:span>',
                        '<text:span text:style-name="T42">{{DUE_DAY}}.</text:span>'
                    )
                    # Month Year (Note: Month 9)
                    xml = xml.replace(
                        '<text:span text:style-name="T46">9</text:span><text:span text:style-name="T47">. 2025</text:span>',
                        '<text:span text:style-name="T46">{{DUE_MONTH_YEAR}}</text:span>'
                    )

                    # 5. VS
                    xml = xml.replace(
                        '30062025',
                        '{{VS}}'
                    )

                    # 6. Customer Block
                    customer_search = '<text:h text:style-name="Heading3" text:outline-level="3"><text:line-break/>ScioŠkola Praha Nusle - základní škola, s.r.o.</text:h><text:p text:style-name="P72">Boleslavova 250/1, Nusle, 140 00 Praha 4</text:p><text:p text:style-name="P73">Česká republika</text:p><text:h text:style-name="Heading3" text:outline-level="3">IČ: 07231881</text:h>'
                    xml = xml.replace(customer_search, '{{CUSTOMER_BLOCK}}')

                    # 7. Description
                    xml = xml.replace(
                        '<text:span text:style-name="T108">Konzultační a programátorské služby na<text:s/></text:span><text:span text:style-name="T109">EduMap</text:span><text:span text:style-name="T110">.</text:span>',
                        '<text:span text:style-name="T108">{{DESCRIPTION}}</text:span>'
                    )

                    # 8. Amounts
                    # All occurrences of 90 000,00 Kč
                    xml = xml.replace('90<text:s/>000,00 Kč', '{{AMOUNT}}')
                    
                    zout.writestr(item.filename, xml.encode('utf-8'))
                else:
                    zout.writestr(item, content)

    print("Template sanitized.")

if __name__ == '__main__':
    sanitize()
