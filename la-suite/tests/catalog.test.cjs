/* Regression checks for shared typography, theme assets and page dependencies. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),context={window:{},document:{getElementById:()=>null}};
vm.createContext(context);
for(const name of ['typography.js','capsule-design.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context);
const typography=context.window.SuiteTypography,design=context.window.SuiteDesign;
assert.equal(Object.keys(typography.catalog).length,12);
assert.equal(new Set(Object.values(typography.catalog).map(f=>f.family)).size,12);
assert.equal(typography.family('unknown'),typography.family('elegant'));
assert(Object.isFrozen(typography.catalog));
for(const theme of design.styles){const bg=design.logoBackground(theme.id);assert(bg.includes('radial-gradient'));assert(bg.includes(theme.background));assert(fs.existsSync(path.join(root,'assets/themes/backgrounds',theme.id+'.webp')));}
assert.equal(design.logoBackground('custom',{background:'javascript:alert(1)'}),'none');
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 const scripts=[...html.matchAll(/<script[^>]+src="([^"?]+)(?:\?[^\"]*)?"/g)].map(m=>m[1]);
 for(const script of scripts.filter(s=>!s.startsWith('http')))assert(fs.existsSync(path.join(root,script)),`${file}: missing ${script}`);
 for(const consumer of ['welcome-ui.js','welcome-visual.js','app.js'])if(scripts.includes(consumer))assert(scripts.indexOf('typography.js')>=0&&scripts.indexOf('typography.js')<scripts.indexOf(consumer),`${file}: typography load order`);
 if(scripts.includes('app.js'))assert(scripts.indexOf('memory-reader.js')>=0&&scripts.indexOf('memory-reader.js')<scripts.indexOf('app.js'));
}
for(const file of JSON.parse(fs.readFileSync(path.join(root,'runtime-files.json'),'utf8')))assert(fs.existsSync(path.join(root,file)),`Manifest: missing ${file}`);
console.log('Typography, 11 themes, HTML dependencies and runtime manifest passed.');
