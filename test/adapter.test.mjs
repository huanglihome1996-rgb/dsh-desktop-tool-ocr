import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAdapter, backendManager} from '../src/index.mjs';
import {registerBackend} from '../src/backends.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
function fixture(modalities=['text'],config={}) {
 let dispatched,calls=0;
 const backend={kind:'ocr',recognize:async()=>{calls++;return {text:'Invoice 12345',kind:'ocr'};}};
 const ctx={attachments:{imageHostPath:()=> 'image.png'},llm:{
 listModels:async()=>[{provider:'source',id:'model',name:'Model',inputModalities:modalities}],
 resolveModelInfo:async()=>({provider:'source',id:'model',name:'Model',inputModalities:modalities}),
 async *stream(options){dispatched=options;yield {type:'finish',reason:{kind:'stop'}};}
 }};
 return {adapter:createAdapter(ctx,'source','auto-vision--source',async()=>backend,config),get dispatched(){return dispatched},get calls(){return calls}};
}
const image={type:'image',attachment:{id:'image'}};
async function run(adapter,messages){for await(const _ of adapter.stream({provider:'auto-vision--source',model:'model',messages})) {}}
test('nonvision accepts images, projects frozen history and caches',async()=>{
 const f=fixture();const messages=Object.freeze([Object.freeze({role:'user',content:Object.freeze([image])})]);
 assert.ok((await f.adapter.resolveModel('', 'model')).inputModalities.includes('image'));
 assert.equal((await f.adapter.listModels())[0].provider,'auto-vision--source');
 await run(f.adapter,messages);await run(f.adapter,messages);
 assert.match(f.dispatched.messages[0].content[0].text,/Invoice 12345/);assert.equal(f.calls,1);assert.equal(messages[0].content[0],image);
});
test('native vision and ordinary text pass through without invoking backend',async()=>{
 const f=fixture(['text','image']);const messages=[{role:'user',content:[image]}];await run(f.adapter,messages);assert.equal(f.dispatched.messages,messages);assert.equal(f.calls,0);
 const g=fixture();const plain=[{role:'user',content:[{type:'text',text:'hello'}]}];await run(g.adapter,plain);assert.equal(g.dispatched.messages,plain);assert.equal(g.calls,0);
});
test('forceRecognition and nested tool results',async()=>{
 const f=fixture(['text','image'],{forceRecognition:true});await run(f.adapter,[{role:'tool',content:[{type:'tool-result',content:[image]}]}]);assert.equal(f.calls,1);assert.equal(f.dispatched.messages[0].content[0].content[0].type,'text');
});
test('backend failures are not cached',async()=>{
 let n=0;const ctx={attachments:{imageHostPath:()=> 'x'},llm:{resolveModelInfo:async()=>({inputModalities:['text']}),async *stream(){}}};
 const adapter=createAdapter(ctx,'s','r',async()=>({recognize:async()=>{n++;throw Error('failed')}}));
 await assert.rejects(run(adapter,[{content:[image]}]),/failed/);await assert.rejects(run(adapter,[{content:[image]}]),/failed/);assert.equal(n,2);
});
test('invalid cache configuration rejected',()=>assert.throws(()=>fixture(['text'],{cacheSize:-1}),/cacheSize/));
test('backend config file hot switching invalidates recognition cache',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'backend-switch-')),file=join(dir,'backend.json');
 const dispose=registerBackend('switch-test',c=>({recognize:async()=>({text:c.text,kind:'ocr'})}));
 try {
  const f=fixture(),ctx={attachments:{imageHostPath:()=> 'x'},llm:{resolveModelInfo:async()=>({inputModalities:['text']}),async *stream(o){ctx.last=o;yield {type:'finish',reason:{kind:'stop'}};}}};
  const adapter=createAdapter(ctx,'s','r',backendManager(ctx,{backendConfigFile:file}));
  await writeFile(file,JSON.stringify({type:'switch-test',text:'first'}));await run(adapter,[{content:[image]}]);assert.match(ctx.last.messages[0].content[0].text,/first/);
  await writeFile(file,JSON.stringify({type:'switch-test',text:'second'}));await run(adapter,[{content:[image]}]);assert.match(ctx.last.messages[0].content[0].text,/second/);
  await writeFile(file,'invalid');await assert.rejects(run(adapter,[{content:[image]}]));
 }finally{dispose();await rm(dir,{recursive:true,force:true});}
});
