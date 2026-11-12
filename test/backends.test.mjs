import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createBackend,registerBackend,detectImage} from '../src/backends.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64');
async function withImage(fn){const dir=await mkdtemp(join(tmpdir(),'recognition-test-'));try{const path=join(dir,'no-extension');await writeFile(path,png);await fn(path,dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('format detection rejects unknown input',()=>{assert.deepEqual(detectImage(png),['png','image/png']);assert.throws(()=>detectImage(Buffer.from('text')),/Unsupported/);});
test('custom command stdout and safe input extension',async()=>withImage(async path=>{
 const b=await createBackend({type:'command',command:process.execPath,args:['-e','console.log(process.argv[1].endsWith(".png") ? "OK" : "BAD")','{input}']});assert.equal((await b.recognize({path})).text,'OK');
}));
test('command file output and JSON text selector',async()=>withImage(async path=>{
 const b=await createBackend({type:'command',command:process.execPath,output:'file',args:['-e','require("fs").writeFileSync(process.argv[2],JSON.stringify({result:{text:"12345"}}))','{input}','{output}'],jsonTextPath:'result.text'});assert.equal((await b.recognize({path})).text,'12345');
}));
test('command error, timeout, cancellation, output limits',async()=>withImage(async path=>{
 const make=(script,extra={})=>createBackend({type:'command',command:process.execPath,args:['-e',script,'{input}'],...extra});
 await assert.rejects((await make('console.error("bad input");process.exit(2)')).recognize({path}),/bad input/);
 await assert.rejects((await make('setTimeout(()=>{},10000)',{timeoutMs:50})).recognize({path}),/timed out/);
 const controller=new AbortController();controller.abort();await assert.rejects((await make('')).recognize({path,signal:controller.signal}));
 await assert.rejects((await make('console.log("x".repeat(1000))',{maxOutputBytes:20})).recognize({path}),/maxOutputBytes/);
}));
test('remote backend requires explicit consent and secure endpoint',async()=>{
 await assert.rejects(createBackend({type:'openai',baseURL:'https://example.com/v1',model:'vision',apiKeyEnv:'KEY'}),/allowRemote/);
 await assert.rejects(createBackend({type:'openai',allowRemote:true,baseURL:'http://example.com/v1',model:'vision',apiKeyEnv:'KEY'}),/HTTPS/);
});
test('remote request uses image and secret, returns vision data (mock network)',async()=>withImage(async path=>{
 let request;const b=await createBackend({type:'openai',allowRemote:true,baseURL:'https://example.com/v1',model:'vision',apiKeyEnv:'KEY'}, {resolveSecret:async()=> 'test-secret',fetch:async(url,opts)=>{request={url,...opts};return new Response(JSON.stringify({choices:[{message:{content:'A chart and title'}}]}));}});
 const r=await b.recognize({path});assert.equal(r.kind,'vision');assert.equal(r.text,'A chart and title');assert.equal(request.url,'https://example.com/v1/chat/completions');assert.equal(request.headers.Authorization,'Bearer test-secret');assert.match(JSON.parse(request.body).messages[0].content[1].image_url.url,/^data:image\/png;base64,/);
}));
test('registry permits third party backends and disposer',async()=>{
 const dispose=registerBackend('test-backend',()=>({recognize:async()=>({text:'test',kind:'ocr'})}));assert.equal((await (await createBackend({type:'test-backend'})).recognize({})).text,'test');dispose();await assert.rejects(createBackend({type:'test-backend'}),/Unknown/);
});
