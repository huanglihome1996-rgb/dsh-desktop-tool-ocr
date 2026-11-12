import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityChecker, parseCatalog, parseOpenAI, parseDeepSeek } from '../src/capabilities.mjs';
const md='# Test\nModel ID: `gpt-test`\n- Input modalities: text, image\n## Snapshots\n- `gpt-test-2026-01-01`';
test('OpenAI exact ID and explicit modalities only',()=>{
 assert.equal(parseOpenAI(md,'gpt-test'),true);assert.equal(parseOpenAI(md,'gpt-test-2026-01-01'),true);
 assert.equal(parseOpenAI(md,'gpt-other'),undefined);assert.equal(parseOpenAI('image everywhere','gpt-test'),undefined);
 assert.equal(parseOpenAI(md.replace('text, image','text'),'gpt-test'),false);
});
test('catalog absence differs from explicit text only and Anthropic boolean',()=>{
 assert.equal(parseCatalog({data:[{id:'x'}]},'x'),undefined);assert.equal(parseCatalog({data:[{id:'x',input_modalities:['text']}]},'x'),false);
 assert.equal(parseCatalog({data:[{id:'x',input_modalities:['text','image']}]},'x'),true);
 assert.equal(parseCatalog({id:'x',capabilities:{image_input:{supported:false}}},'x'),false);
});
test('DeepSeek prose only recognizes explicit documented exact names',()=>{
 const html='The <code>deepseek-flash</code> model accepts images alongside text';assert.equal(parseDeepSeek(html,'deepseek-flash'),true);assert.equal(parseDeepSeek(html,'deepseek-v4-pro'),undefined);
});
test('official evidence does not verify arbitrary gateway; no credential forwarding',async()=>{
 let calls=0;const checker=createCapabilityChecker({}, {fetch:async(url,opts)=>{calls++;assert.equal(opts.headers.Authorization,undefined);return new Response(md);}});
 const result=await checker.check('hth','gpt-test',{baseURL:'https://gateway.example/v1'});assert.equal(result.status,'supported');assert.equal(result.routeVerified,false);
 await checker.check('hth','gpt-test',{baseURL:'https://gateway.example/v1'});assert.equal(calls,1);
});
test('official direct route and manually trusted gateway are separate',async()=>{
 const services={fetch:async()=>new Response(md)};
 const direct=await createCapabilityChecker({},services).check('openai','gpt-test',{baseURL:'https://api.openai.com/v1'});assert.equal(direct.routeVerified,true);
 const wrong=await createCapabilityChecker({},services).check('other','gpt-test',{baseURL:'https://api.deepseek.com'});assert.equal(wrong.routeVerified,false);
 const trusted=await createCapabilityChecker({providers:{hth:{trustGateway:true}}},services).check('hth','gpt-test');assert.equal(trusted.routeVerified,true);
});
test('404, unknown name, missing field and explicit false remain distinct',async()=>{
 const c=createCapabilityChecker({}, {fetch:async()=>new Response('not found',{status:404})});assert.equal((await c.check('s','gpt-no-such-model')).status,'unknown');
 assert.equal((await c.check('s','custom-vision-model')).status,'unknown');
 const no=await createCapabilityChecker({}, {fetch:async()=>new Response(md.replace('text, image','text'))}).check('s','gpt-test');assert.equal(no.status,'unsupported');
});
test('metadata endpoint cannot leak secret to a custom URL or inference endpoint',async()=>{
 let calls=0;const c=createCapabilityChecker({providers:{s:{catalogURL:'https://evil.example/models',apiKeyEnv:'KEY'}}},{fetch:async()=>{calls++;},resolveSecret:async()=>{throw Error('must not read secret')}});
 assert.equal((await c.check('s','x')).status,'unknown');assert.equal(calls,0);
 const invalid=createCapabilityChecker({providers:{s:{catalogURL:'https://api.openai.com/v1/chat/completions'}}},{fetch:async()=>{calls++;}});assert.equal((await invalid.check('s','x')).status,'unknown');assert.equal(calls,0);
});
test('TTL refresh and inflight deduplication',async()=>{
 let time=0,calls=0;const c=createCapabilityChecker({ttlMs:1000},{now:()=>time,fetch:async()=>{calls++;return new Response(md)}});
 await Promise.all([c.check('s','gpt-test'),c.check('s','gpt-test')]);assert.equal(calls,1);time=1100;await c.check('s','gpt-test');assert.equal(calls,2);
});
test('explicit per-route override avoids network',async()=>{
 const c=createCapabilityChecker({overrides:{s:{custom:true}}},{fetch:()=>{throw Error('no network')}});const r=await c.check('s','custom');assert.equal(r.status,'supported');assert.equal(r.routeVerified,true);
});
