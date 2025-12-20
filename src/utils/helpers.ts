export function escapeXml(s: string) { 
    return s.replace(/[<>&'"]/g, c => {
        switch(c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
        return c;
    }); 
}
