import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Sale, BusinessUnit, Branch, Shift, CustomerLedgerEntry } from '../types';

// Extend jsPDF with autotable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export const generateReceiptPDF = (sale: Sale, businessUnit: BusinessUnit | null | undefined, branch: Branch | undefined, allBranches: Branch[] = []) => {
  // POS Receipt is typically 80mm wide. 
  // In points (1pt = 1/72 inch), 80mm is approx 226pt.
  // We'll use a custom size or just a narrow page.
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 250] // Increased height to accommodate branch list
  });

  const margin = 5;
  let y = 10;

  // Header
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(businessUnit?.name || 'GAM SHOP', 40, y, { align: 'center' });
  y += 5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  if (branch?.name) {
    doc.text(`Current Location: ${branch.name}`, 40, y, { align: 'center' });
    y += 4;
  }
  
  const location = branch?.location || businessUnit?.location;
  if (location) {
    doc.text(location, 40, y, { align: 'center' });
    y += 4;
  }
  
  if (businessUnit?.tin) {
    doc.text(`TIN: ${businessUnit.tin}`, 40, y, { align: 'center' });
    y += 4;
  }

  y += 2;
  doc.line(margin, y, 75, y);
  y += 5;

  // Sale Info
  doc.setFontSize(7);
  doc.text(`Date: ${new Date(sale.timestamp).toLocaleString()}`, margin, y);
  y += 4;
  doc.text(`Receipt #: ${sale.id}`, margin, y);
  y += 4;
  doc.text(`Clerk: ${sale.clerkName}`, margin, y);
  y += 6;

  // Items Table
  const tableData = sale.items.map(item => {
    const itemTotal = item.total ?? (item.discountType === 'percentage' 
      ? item.subtotal * (1 - (item.discount || 0) / 100)
      : Math.max(0, item.subtotal - (item.discount || 0)));
    
    return [
      item.name + (item.discount ? `\n(Disc: -${item.discountType === 'percentage' ? `${item.discount}%` : item.discount.toFixed(2)})` : ''),
      item.quantity.toString(),
      item.price?.toFixed(2) || '0.00',
      itemTotal?.toFixed(2) || '0.00'
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Item', 'Qty', 'Price', 'Total']],
    body: tableData,
    theme: 'plain',
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fontStyle: 'bold' },
    margin: { left: margin, right: margin },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 12, halign: 'right' },
      3: { cellWidth: 13, halign: 'right' }
    }
  });

  y = (doc as any).lastAutoTable.finalY + 5;

  // Totals
  doc.setFont('helvetica', 'bold');
  doc.text('Subtotal:', 50, y);
  doc.text(`GHC ${(sale.subtotal || sale.total || 0).toFixed(2)}`, 75, y, { align: 'right' });
  y += 4;

  if (sale.discount) {
    doc.setFont('helvetica', 'italic');
    doc.text(`Discount (${sale.discountType === 'percentage' ? `${sale.discount}%` : 'Fixed'}):`, 50, y);
    const discAmount = (sale.subtotal || sale.total) - (sale.total - sale.tax);
    doc.text(`-GHC ${(discAmount || 0).toFixed(2)}`, 75, y, { align: 'right' });
    y += 4;
  }
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Tax (Incl):`, 50, y);
  doc.text(`GHC ${(sale.tax || 0).toFixed(2)}`, 75, y, { align: 'right' });
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('Total:', 50, y);
  doc.text(`GHC ${(sale.subtotal ? sale.total : (sale.total + (sale.tax || 0)) || 0).toFixed(2)}`, 75, y, { align: 'right' });
  y += 4;

  doc.text(`Payment:`, 50, y);
  doc.text(sale.paymentMethod.toUpperCase(), 75, y, { align: 'right' });
  y += 8;

  // Other Branches Section
  const otherStores = allBranches.filter(b => b.type === 'store' && b.id !== branch?.id);
  if (otherStores.length > 0) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('OUR OTHER LOCATIONS:', 40, y, { align: 'center' });
    y += 4;
    doc.setFont('helvetica', 'normal');
    otherStores.forEach(store => {
      doc.text(`${store.name}: ${store.location}`, 40, y, { align: 'center' });
      y += 3.5;
    });
    y += 4;
  }

  // Footer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text('Thank you for your business!', 40, y, { align: 'center' });
  y += 4;
  doc.text('Please keep your receipt.', 40, y, { align: 'center' });

  doc.save(`receipt_${sale.id}.pdf`);
};

export const generateInvoicePDF = (sale: Sale, businessUnit: BusinessUnit | null | undefined, branch: Branch | undefined, allBranches: Branch[] = []) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const margin = 20;
  let y = 20;

  // Header - Business Info
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(businessUnit?.name || 'GAM SHOP', margin, y);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('SALES INVOICE', 190, y, { align: 'right' });
  y += 10;

  doc.setFontSize(10);
  if (branch?.name) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Location: ${branch.name}`, margin, y);
    doc.setFont('helvetica', 'normal');
    y += 5;
  }
  
  const location = branch?.location || businessUnit?.location;
  if (location) {
    doc.text(location, margin, y);
    y += 5;
  }
  
  if (businessUnit?.tin) {
    doc.text(`TIN: ${businessUnit.tin}`, margin, y);
    y += 5;
  }

  // Invoice Details
  y = 20;
  doc.text(`Invoice Date: ${new Date(sale.timestamp).toLocaleDateString()}`, 190, y + 15, { align: 'right' });
  doc.text(`Invoice #: INV-${sale.id}`, 190, y + 20, { align: 'right' });
  doc.text(`Payment Method: ${sale.paymentMethod.toUpperCase()}`, 190, y + 25, { align: 'right' });

  y = 50;
  doc.line(margin, y, 190, y);
  y += 10;

  // Customer Info (if available)
  if (sale.customerPhone) {
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`Phone: ${sale.customerPhone}`, margin, y + 5);
    y += 15;
  }

  // Items Table
  const tableData = sale.items.map(item => {
    const itemTotal = item.total ?? (item.discountType === 'percentage' 
      ? item.subtotal * (1 - (item.discount || 0) / 100)
      : Math.max(0, item.subtotal - (item.discount || 0)));
    
    return [
      item.name + (item.discount ? ` (Disc: -${item.discountType === 'percentage' ? `${item.discount}%` : item.discount.toFixed(2)})` : ''),
      item.quantity.toString(),
      `GHC ${(item.price || 0).toFixed(2)}`,
      `GHC ${(itemTotal || 0).toFixed(2)}`
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Quantity', 'Unit Price', 'Amount']],
    body: tableData,
    headStyles: { fillColor: [249, 115, 22], textColor: [255, 255, 255] }, // Orange-500
    styles: { fontSize: 10 },
    margin: { left: margin, right: margin }
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Summary
  const summaryX = 140;
  doc.text('Subtotal:', summaryX, y);
  doc.text(`GHC ${(sale.subtotal || sale.total || 0).toFixed(2)}`, 190, y, { align: 'right' });
  y += 7;

  if (sale.discount) {
    doc.setFont('helvetica', 'italic');
    const discAmount = (sale.subtotal || sale.total) - (sale.total - sale.tax);
    doc.text(`Discount (${sale.discountType === 'percentage' ? `${sale.discount}%` : 'Fixed'}):`, summaryX, y);
    doc.text(`-GHC ${(discAmount || 0).toFixed(2)}`, 190, y, { align: 'right' });
    y += 7;
    doc.setFont('helvetica', 'normal');
  }

  doc.text('Tax:', summaryX, y);
  doc.text(`GHC ${(sale.tax || 0).toFixed(2)}`, 190, y, { align: 'right' });
  y += 7;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Total Amount:', summaryX, y);
  doc.text(`GHC ${(sale.subtotal ? sale.total : (sale.total + (sale.tax || 0)) || 0).toFixed(2)}`, 190, y, { align: 'right' });

  y += 15;

  // Other Branches Section
  const otherStores = allBranches.filter(b => b.type === 'store' && b.id !== branch?.id);
  if (otherStores.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('OUR OTHER LOCATIONS:', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    otherStores.forEach(store => {
      doc.text(`• ${store.name}: ${store.location}`, margin + 2, y);
      y += 5;
    });
  }

  // Footer
  y = 270;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Thank you for your business!', 105, y, { align: 'center' });
  doc.text('This is a computer generated invoice.', 105, y + 4, { align: 'center' });

  doc.save(`invoice_${sale.id}.pdf`);
};

export const generateShiftReportPDF = (
  shift: Shift, 
  sales: Sale[], 
  payments: CustomerLedgerEntry[], 
  businessUnit: BusinessUnit | null | undefined,
  branch: Branch | undefined,
  clerkName: string
) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const margin = 20;
  let y = 20;

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(businessUnit?.name || 'GAM SHOP', margin, y);
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('DAILY TILL TRANSACTION REPORT', 190, y, { align: 'right' });
  y += 10;

  doc.setFontSize(10);
  doc.text(`Branch: ${branch?.name || 'Main'}`, margin, y);
  doc.text(`Clerk: ${clerkName}`, 190, y, { align: 'right' });
  y += 5;
  doc.text(`Shift ID: ${shift.displayId || shift.id}`, margin, y);
  doc.text(`Status: ${shift.status.toUpperCase()}`, 190, y, { align: 'right' });
  y += 5;
  doc.text(`Started: ${new Date(shift.startTime).toLocaleString()}`, margin, y);
  if (shift.endTime) {
    doc.text(`Ended: ${new Date(shift.endTime).toLocaleString()}`, 190, y, { align: 'right' });
  }
  y += 10;

  doc.line(margin, y, 190, y);
  y += 10;

  // Financial Summary
  doc.setFont('helvetica', 'bold');
  doc.text('FINANCIAL SUMMARY', margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal');

  const cashSales = sales.filter(s => s.paymentMethod === 'cash').reduce((acc, s) => acc + s.total, 0);
  const otherSales = sales.filter(s => s.paymentMethod !== 'cash').reduce((acc, s) => acc + s.total, 0);
  const cashPayments = payments.filter(p => p.paymentMethod === 'cash').reduce((acc, p) => acc + p.amount, 0);
  const otherPayments = payments.filter(p => p.paymentMethod !== 'cash').reduce((acc, p) => acc + p.amount, 0);

  const summaryData = [
    ['Opening Cash', `GHC ${(shift.openingCash || 0).toFixed(2)}`],
    ['Cash Sales', `GHC ${(cashSales || 0).toFixed(2)}`],
    ['Customer Cash Payments', `GHC ${(cashPayments || 0).toFixed(2)}`],
    ['Expected Cash in Till', `GHC ${(shift.expectedCash || ((shift.openingCash || 0) + (cashSales || 0) + (cashPayments || 0))).toFixed(2)}`],
    ['Actual Cash Counted', shift.closingCash ? `GHC ${shift.closingCash.toFixed(2)}` : 'N/A'],
    ['Variance', shift.closingCash ? `GHC ${(shift.closingCash - (shift.expectedCash || ((shift.openingCash || 0) + (cashSales || 0) + (cashPayments || 0)))).toFixed(2)}` : 'N/A'],
    ['Non-Cash Sales (Card/Momo/Cheque)', `GHC ${(otherSales || 0).toFixed(2)}`],
    ['Non-Cash Cust. Payments', `GHC ${(otherPayments || 0).toFixed(2)}`]
  ];

  autoTable(doc, {
    startY: y,
    body: summaryData,
    theme: 'grid',
    styles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 100 }, 1: { halign: 'right' } },
    margin: { left: margin, right: margin }
  });

  y = (doc as any).lastAutoTable.finalY + 15;

  // Transaction Details
  doc.setFont('helvetica', 'bold');
  doc.text('TRANSACTION DETAILS', margin, y);
  y += 8;

  const transactionData = [
    ...sales.map(s => [
      new Date(s.timestamp).toLocaleTimeString(),
      'SALE',
      s.id,
      s.paymentMethod.toUpperCase(),
      `GHC ${(s.total || 0).toFixed(2)}`
    ]),
    ...payments.map(p => [
      new Date(p.timestamp).toLocaleTimeString(),
      'CUST PAYMENT',
      p.id.substring(0, 8),
      (p.paymentMethod || 'CASH').toUpperCase(),
      `GHC ${(p.amount || 0).toFixed(2)}`
    ])
  ].sort((a, b) => a[0].localeCompare(b[0]));

  autoTable(doc, {
    startY: y,
    head: [['Time', 'Type', 'Reference', 'Method', 'Amount']],
    body: transactionData,
    headStyles: { fillColor: [51, 65, 85] },
    styles: { fontSize: 9 },
    margin: { left: margin, right: margin }
  });

  // Footer
  y = 280;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text('Generated by GAM POS System', 105, y, { align: 'center' });

  doc.save(`shift_report_${shift.id}.pdf`);
};
