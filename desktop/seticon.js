// Embeds the icon and version details into the Windows executable, in pure JavaScript (no Wine).
// Usage: node seticon.js <exe> <ico> <version>
const fs = require('fs');
const ResEdit = require('resedit');
const PELibrary = require('pe-library');
const [exePath, icoPath, version] = process.argv.slice(2);

const exe = PELibrary.NtExecutable.from(fs.readFileSync(exePath));
const res = PELibrary.NtExecutableResource.from(exe);

// icon: replace every existing icon group with ours (Electron ships one group)
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const ids = groups.length ? groups.map(g => [g.id, g.lang]) : [[1, 1033]];
for (const [id, lang] of ids) ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map(i => i.data));

// version information shown in file properties and in "Apps & features"
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
const [a, b, c] = version.split('.').map(Number);
vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  FileDescription: 'ADC - مساعد رئيس القسم',
  ProductName: 'مساعد رئيس القسم',
  CompanyName: 'قسم العلوم السياسية - جامعة بسكرة',
  LegalCopyright: '© 2026 قسم العلوم السياسية - جامعة بسكرة',
  InternalName: 'ADC', OriginalFilename: 'ADC.exe',
  FileVersion: version, ProductVersion: version
});
vi.outputToResourceEntries(res.entries);

res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));

// read back to verify
const exe2 = PELibrary.NtExecutable.from(fs.readFileSync(exePath));
const res2 = PELibrary.NtExecutableResource.from(exe2);
const g2 = ResEdit.Resource.IconGroupEntry.fromEntries(res2.entries);
const v2 = ResEdit.Resource.VersionInfo.fromEntries(res2.entries)[0];
console.log('icon groups:', g2.length, '| sizes:', g2[0].icons.map(i => i.width || 256).join(','));
console.log('version:', JSON.stringify(v2.getStringValues({ lang: 1033, codepage: 1200 })));
