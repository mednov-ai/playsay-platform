import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const require=createRequire(`${root}/frontend/package.json`);
const toolingRequire=createRequire(require.resolve('ajv-formats'));
const Ajv=toolingRequire('ajv/dist/2020');
const addFormats=require('ajv-formats');
const YAML=require('yaml');
const ajv=new Ajv({strict:false});addFormats(ajv);
const schema=JSON.parse(readFileSync(`${root}/contracts/material-game-reference.schema.json`,'utf8'));
const validate=ajv.compile(schema);
const id='11111111-1111-4111-8111-111111111111',revision='22222222-2222-4222-8222-222222222222';
assert.equal(validate({id:'occurrence',type:'htmlGame',gameId:id,gameRevisionId:revision,title:'Keep title',custom:{retained:true}}),true);
assert.equal(validate({id:'legacy',type:'htmlGame',url:`material-asset:${id}`}),true);
assert.equal(validate({id:'empty',type:'htmlGame'}),true);
assert.equal(validate({id:'invalid',type:'htmlGame',gameId:id}),false);
assert.equal(validate({id:'invalid',type:'htmlGame',gameId:id,gameRevisionId:revision,url:`material-asset:${id}`}),false);
const api=YAML.parse(readFileSync(`${root}/contracts/openapi.yaml`,'utf8'));
for(const [path,method] of [['/games','get'],['/games','post'],['/games/{gameId}/revisions','post'],['/games/{gameId}/processing','post'],['/materials/{materialId}/games','post'],['/schedule/lessons/{lessonId}/game-launches','post'],['/schedule/lessons/{lessonId}/game-launches/{launchId}/stop','post']]) {
 const operation=api.paths[path]?.[method];assert.ok(operation,`${method} ${path}`);
 assert.ok(operation.responses[method==='post'&&path.endsWith('revisions')?'201':path==='/games'&&method==='post'?'201':'200']);
 assert.equal(operation.responses['409'].content['application/json'].schema.$ref,'#/components/schemas/ProjectErrorResponse');
}
const visited=new Set();
function walk(value){if(!value||typeof value!=='object'||visited.has(value))return;visited.add(value);if(value.$ref?.startsWith('#/')){let target=api;for(const key of value.$ref.slice(2).split('/'))target=target?.[key.replaceAll('~1','/').replaceAll('~0','~')];assert.ok(target,`Unresolved OpenAPI reference: ${value.$ref}`);}Object.values(value).forEach(walk);}
walk(api);
console.log('HTML game reference schema, generated OpenAPI routes/errors and local references passed');
