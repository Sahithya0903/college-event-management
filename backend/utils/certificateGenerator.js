const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

/**
 * Writes a landscape A4 participation certificate to outPath.
 */
module.exports = async function generateCertificatePdf(data, outPath) {
  const {
    certificateId,
    name,
    organization,
    eventTitle,
    eventDate,
    organizer,
    layout = 'classic',
    accent = '#3D3BF3',
    title = 'Certificate of Participation',
    message = 'for successfully participating in',
    backgroundPath,
    awardPlace = '',
  } = data;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const stream = fs.createWriteStream(outPath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);

    const W = doc.page.width;
    const H = doc.page.height;
    const INK = '#15173D';
    const PRIMARY = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#3D3BF3';
    const GOLD = '#FFC93C';

    if (backgroundPath && fs.existsSync(backgroundPath)) {
      doc.image(backgroundPath, 0, 0, { width: W, height: H });
    } else {
      doc.rect(0, 0, W, H).fill('#FFFFFF');
      if (layout === 'modern') {
        doc.rect(0, 0, 34, H).fill(PRIMARY);
        doc.rect(34, 0, 8, H).fill(GOLD);
        doc.rect(70, 52, W - 112, H - 104).lineWidth(1.5).strokeColor(PRIMARY).stroke();
      } else if (layout === 'minimal') {
        doc.rect(72, 58, W - 144, 5).fill(PRIMARY);
        doc.rect(72, H - 63, W - 144, 2).fill(GOLD);
      } else {
        doc.lineWidth(10).strokeColor(INK).rect(24, 24, W - 48, H - 48).stroke();
        doc.lineWidth(2).strokeColor(GOLD).rect(42, 42, W - 84, H - 84).stroke();
      }
    }

    doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(15).text('EVENTLY', 0, 78, { align: 'center', characterSpacing: 6 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(38).text(title || 'Certificate of Participation', 50, 112, { align: 'center', width: W - 100 });

    doc.fillColor('#555B7A').font('Helvetica').fontSize(15).text('This certificate is presented to', 0, 190, { align: 'center' });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(40).text(name, 60, 222, { align: 'center', width: W - 120 });
    doc.strokeColor(GOLD).lineWidth(2).moveTo(W / 2 - 170, 278).lineTo(W / 2 + 170, 278).stroke();

    if (awardPlace) {
      doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(24).text(`${awardPlace} Winner`, 60, 298, { align: 'center', width: W - 120 });
      doc.fillColor('#555B7A').font('Helvetica').fontSize(14).text('for outstanding achievement in', 60, 329, { align: 'center', width: W - 120 });
      doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(24).text(eventTitle, 60, 352, { align: 'center', width: W - 120 });
    } else {
      doc.fillColor('#555B7A').font('Helvetica').fontSize(15).text(message || 'for successfully participating in', 60, 298, { align: 'center', width: W - 120 });
      doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(26).text(eventTitle, 60, 326, { align: 'center', width: W - 120 });
    }
    doc.fillColor('#555B7A').font('Helvetica').fontSize(14).text(eventDate, 0, 372, { align: 'center' });
    if (organization) {
      doc.fillColor('#555B7A').font('Helvetica').fontSize(12).text(`College / Organization: ${organization}`, 60, 398, { align: 'center', width: W - 120 });
    }

    doc.moveTo(70, H - 82).lineTo(W - 70, H - 82).lineWidth(1).strokeColor('#D9A441').stroke();
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(`Certificate ID: ${certificateId}`, 0, H - 112, { align: 'center', width: W });
    doc.fillColor('#555B7A').font('Helvetica').fontSize(10).text(`Organised by ${organizer}`, 0, H - 94, { align: 'center', width: W });

    doc.end();
  });
};
