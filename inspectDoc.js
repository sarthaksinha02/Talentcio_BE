const fs = require('fs');
const PizZip = require('pizzip');

const content = fs.readFileSync('./templates/offer_letter_template.docx', 'binary');
const zip = new PizZip(content);
const xml = zip.file('word/document.xml').asText();
console.log(xml.substring(7000, 8000));
