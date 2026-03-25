const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

try {
    const content = fs.readFileSync('./templates/offer_letter_template.docx', 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => '—'
    });

    doc.render({
        offer_date: "Date",
        employee_full_name: "Name",
        employee_first_name: "First",
        employee_permanent_address: "Addr",
        employee_city: "City",
        designation: "Desig",
        department: "Dept",
        joining_date: "Join",
        work_location: "Loc",
        probation_period: "Prob",
        annual_ctc: "1",
        basic_salary: "1",
        hra: "1",
        special_allowance: "1",
        monthly_gross: "1",
        monthly_ctc: "1",
        hr_name: "HR",
        hr_designation: "HRD",
        declaration_date: "Date",
        employee_signature_name: "Sig",
        employee_id: "ID"
    });
    console.log("Render successful!");
} catch (error) {
    if (error.properties && error.properties.errors) {
        console.error("Docxtemplater Errors:", error.properties.errors.map(e => e.message || e));
    } else {
        console.error("Error:", error);
    }
}
