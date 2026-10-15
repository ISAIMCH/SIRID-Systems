const PDFDocument = require('pdfkit');

const COLORS = {
    ink: '#1d1d1f',
    muted: '#6e6e73',
    border: '#d2d2d7',
    accent: '#1d6eff'
};

function formatMoney(value) {
    return `$${Number(value).toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} MXN`;
}

function formatDate(value) {
    return new Date(value).toLocaleString('es-MX', {
        dateStyle: 'long',
        timeStyle: 'short'
    });
}

function methodLabel(method) {
    return {
        stripe: 'Tarjeta',
        paypal: 'PayPal',
        paynet: 'Paynet'
    }[method] || method;
}

function statusLabel(status) {
    return status === 'pagado' ? 'Pagado' : 'Pendiente';
}

function drawLine(doc, y) {
    doc
        .moveTo(50, y)
        .lineTo(545, y)
        .strokeColor(COLORS.border)
        .stroke();
}

function addReceiptHeader(doc) {
    doc
        .fillColor(COLORS.ink)
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('GYMGO');
    doc
        .fillColor(COLORS.accent)
        .fontSize(10)
        .font('Helvetica')
        .text('SISTEMA OPERATIVO PARA TU GIMNASIO');
    doc.moveDown(1.5);
}

function addCustomerAndPaymentDetails(doc, payment, user) {
    const leftColumn = 50;
    const rightColumn = 315;
    const detailsTop = doc.y;

    doc
        .fillColor(COLORS.ink)
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('Datos del cliente', leftColumn, detailsTop);
    doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(COLORS.muted)
        .text(`${user.nombre} ${user.apellidos || ''}`.trim(), leftColumn)
        .text(user.email, leftColumn);

    doc
        .fillColor(COLORS.ink)
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('Datos de la operación', rightColumn, detailsTop);
    doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(COLORS.muted)
        .text(`Orden: ${payment.orderId}`, rightColumn)
        .text(`Fecha: ${formatDate(payment.createdAt)}`, rightColumn)
        .text(`Método: ${methodLabel(payment.method)}`, rightColumn)
        .text(`Estado: ${statusLabel(payment.status)}`, rightColumn);

    if (payment.last4) doc.text(`Tarjeta: •••• ${payment.last4}`, rightColumn);
    if (payment.reference) doc.text(`Referencia: ${payment.reference}`, rightColumn);
    if (payment.expiresAt) doc.text(`Vence: ${formatDate(payment.expiresAt)}`, rightColumn);

    doc.y = Math.max(doc.y, detailsTop + 92);
    doc.moveDown();
}

function addItemsTable(doc, payment) {
    doc
        .fillColor(COLORS.ink)
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('Detalle de la compra');
    doc.moveDown(.5);

    doc
        .fontSize(9)
        .fillColor(COLORS.muted)
        .font('Helvetica-Bold')
        .text('Producto', 50, doc.y, { width: 280 })
        .text('Cantidad', 350, doc.y, { width: 70, align: 'right' })
        .text('Importe', 445, doc.y, { width: 100, align: 'right' });
    doc.moveDown(.5);
    drawLine(doc, doc.y);
    doc.moveDown(.6);

    payment.items.forEach((item) => {
        const rowY = doc.y;
        const amount = item.unitPrice * item.quantity;
        doc
            .font('Helvetica')
            .fillColor(COLORS.ink)
            .fontSize(10)
            .text(item.title, 50, rowY, { width: 280 })
            .text(String(item.quantity), 350, rowY, { width: 70, align: 'right' })
            .text(formatMoney(amount), 445, rowY, { width: 100, align: 'right' });
        doc.moveDown(1.2);
    });
}

function addTotals(doc, payment) {
    drawLine(doc, doc.y);
    doc.moveDown(.8);

    const totalRow = (label, value, bold = false) => {
        doc
            .font(bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(bold ? 12 : 10)
            .fillColor(COLORS.ink)
            .text(label, 330, doc.y, { width: 115, align: 'right' })
            .text(formatMoney(value), 445, doc.y, { width: 100, align: 'right' });
        doc.moveDown(1.1);
    };

    totalRow('Subtotal', payment.subtotal);
    totalRow('IVA 16%', payment.tax);
    totalRow('Total', payment.total, true);
}

function addFooter(doc) {
    const footerY = 680;
    drawLine(doc, footerY);
    doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(COLORS.muted)
        .text('GYMGO | Destino principal, México', 50, footerY + 10, {
            align: 'center'
        })
        .text('Tel. +52 772 105 0282 | project.gymgo@gmail.com', 50, footerY + 24, {
            align: 'center'
        })
        .fontSize(8)
        .text('Este documento es un comprobante de operación de prueba y no representa una factura fiscal.', 50, footerY + 42, {
            align: 'center'
        });
}

function createReceipt(payment, user, response) {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    doc.pipe(response);
    addReceiptHeader(doc);
    addCustomerAndPaymentDetails(doc, payment, user);
    addItemsTable(doc, payment);
    addTotals(doc, payment);
    addFooter(doc);
    doc.end();
}

module.exports = { createReceipt };
