// Optional integration smoke; set DSH_NODE_MODULES to the running installation's module directory.
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const root=process.env.DSH_NODE_MODULES;if(!root)throw Error('Set DSH_NODE_MODULES to actual host module directory');
 const {Context}=require(path.join(root,'@deepseek-ai/cordis'));
 const {LlmRuntime}=require(path.join(root,'@deepseek-ai/dsh-llm'));
 const plugin=await import('../src/index.mjs');
 const ctx=new Context();ctx.plugin(LlmRuntime);await new Promise(r=>setTimeout(r,50));
 ctx.provide('attachments');ctx.set('attachments',{imageHostPath:()=>process.env.OCR_SMOKE_IMAGE});
 let last,modalities=['text'];
 ctx.plugin({name:'smoke-source',inject:['llm'],apply(c){c.llm.registerAdapter(['smoke'],{
 providerInfo:()=>({id:'smoke',name:'Smoke'}),providerRetryPolicy:()=>undefined,
 listModels:async()=>[{provider:'smoke',id:'test',name:'Test',inputModalities:modalities}],
 resolveModel:async()=>({provider:'smoke',id:'test',name:'Test',inputModalities:modalities}),
 prepareCall:async()=>({model:{provider:'smoke',id:'test',name:'Test',inputModalities:modalities},stream:async function*(o){last=o;yield {type:'finish',reason:{kind:'stop'}};}})
 });}});
 ctx.plugin(plugin,{backend:{type:'nbocr',command:process.env.NBOCR_BIN??'nbocr'}});await new Promise(r=>setTimeout(r,100));
 assert.ok((await ctx.llm.resolveModelInfo('auto-vision--smoke','test')).inputModalities.includes('image'));
 const messages=[{id:'smoke',role:'user',content:[{type:'image',attachment:{id:'test'}}]}];
 for await(const chunk of ctx.llm.stream({provider:'auto-vision--smoke',model:'test',messages})){if(chunk.reason?.kind==='error')throw Error(JSON.stringify(chunk));}
 assert.match(last.messages[0].content[0].text,/12345/);
 modalities=['text','image'];for await(const _ of ctx.llm.stream({provider:'auto-vision--smoke',model:'test',messages})){}
 assert.equal(last.messages[0].content[0].type,'image');console.log('PASS actual DSH host registration, real nbocr projection and native vision passthrough');
})().catch(e=>{console.error(e);process.exitCode=1});
