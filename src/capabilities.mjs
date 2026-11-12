import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

const OPENAI = 'https://developers.openai.com/api/docs/models/';
const DEEPSEEK = 'https://api-docs.deepseek.com/guides/vision/';
const OFFICIAL_HOSTS = new Set(['api.deepseek.com','api.openai.com','api.anthropic.com','generativelanguage.googleapis.com']);
export function parseOpenAI(text, model) {
  const id = text.match(/^Model ID:\s*`([^`]+)`/m)?.[1];
  const ids = new Set([id, ...[...text.matchAll(/^- `([^`]+)`/gm)].map(m=>m[1])]);
  if (!ids.has(model)) return undefined;
  const line = text.match(/^- Input modalities:\s*(.+)$/mi)?.[1];
  if (!line) return undefined;
  const modalities = line.toLowerCase().split(/[,\s]+/).filter(Boolean);
  if (!modalities.includes('text') && !modalities.includes('image')) return undefined;
  return modalities.includes('image');
}
export function parseCatalog(json, model) {
  const row = (json.data ?? json.models ?? (json.id ? [json] : [])).find(m => m.id === model || m.name === `models/${model}`);
  if (typeof row?.capabilities?.image_input?.supported === 'boolean') return row.capabilities.image_input.supported;
  const mods = row?.input_modalities ?? row?.inputModalities ?? row?.modalities?.input;
  if (!Array.isArray(mods) || !mods.length || mods.some(v => typeof v !== 'string')) return undefined;
  return mods.includes('image');
}
function textOnly(html) { return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' '); }
export function parseDeepSeek(html, model) {
  const text = textOnly(html);
  if (model === 'deepseek-flash' && /deepseek-flash.{0,40}model accepts images alongside text/i.test(text)) return true;
  if (model === 'deepseek-v4-flash-vision-exp' && /deepseek-v4-flash-vision-exp.{0,160}requests are served by the latest Flash model/i.test(text) && /model accepts images alongside text/i.test(text)) return true;
  return undefined;
}
export function createCapabilityChecker(config = {}, services = {}) {
  const fetcher = services.fetch ?? globalThis.fetch;
  const now = services.now ?? Date.now;
  const records = new Map(), pending = new Map(), documents = new Map();
  const ttl = config.ttlMs ?? 86400000;
  if (!Number.isSafeInteger(ttl) || ttl < 1000) throw new Error('capabilityCheck.ttlMs must be >=1000');
  let loaded=false, persistQueue=Promise.resolve();
  async function load() {
    if (loaded) return; loaded=true;
    if (!config.cacheFile) return;
    try { const data=JSON.parse(await readFile(config.cacheFile,'utf8'));if(data.version===1)for(const row of data.records??[])if(typeof row.key==='string')records.set(row.key,row); }catch{}
  }
  function persist() {
    if(!config.cacheFile)return;
    persistQueue=persistQueue.catch(()=>{}).then(async()=>{
      await mkdir(dirname(config.cacheFile),{recursive:true});
      const temp=config.cacheFile+'.tmp';
      await writeFile(temp,JSON.stringify({version:1,records:[...records.values()]},null,2),'utf8');
      await rename(temp,config.cacheFile);
    }).catch(()=>services.warn?.('Capability report could not be saved'));
  }
  async function fetchText(url, headers={}) {
    const response=await fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(config.timeoutMs??8000)});
    if(!response.ok){await response.body?.cancel();throw new Error(`Official source HTTP ${response.status}`);}
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>2000000)throw new Error('Official source exceeds 2 MB');chunks.push(chunk);}
    return Buffer.concat(chunks).toString('utf8');
  }
  async function document(url, headers) {
    const key = url + createHash('sha256').update(JSON.stringify(headers)).digest('hex');
    const previous = documents.get(key);
    if (previous && now() - previous.time < Math.min(ttl, 60000)) return previous.promise;
    const promise = fetchText(url, headers);
    documents.set(key, { time: now(), promise });
    try { return await promise; } catch (error) { documents.delete(key); throw error; }
  }
  function sourceFor(provider, model) {
    const mapped=config.providers?.[provider];
    if(mapped?.catalogURL) {
      const u=new URL(mapped.catalogURL);
      if(u.protocol!=='https:'||!OFFICIAL_HOSTS.has(u.hostname)||u.username||u.password||u.search||u.hash)throw new Error('catalogURL must use an allowlisted official HTTPS model endpoint without credentials/query');
      if (!/^\/(?:v1\/)?models(?:\/[^/]+)?\/?$/.test(u.pathname)) throw new Error('catalogURL must be a model metadata endpoint');
      return {url:u.href,format:'catalog',mapping:mapped};
    }
    // Prefixes choose an official page to query only; never establish a capability.
    if (/^(gpt-|o[1-9](?:-|$)|chatgpt-)/.test(model) && /^[a-z0-9._-]{1,120}$/.test(model))return {url:OPENAI+encodeURIComponent(model)+'.md',format:'openai',mapping:mapped};
    if (model==='deepseek-flash'||model==='deepseek-v4-flash-vision-exp')return {url:DEEPSEEK,format:'deepseek',mapping:mapped};
    return {mapping:mapped};
  }
  async function check(provider, model, route={}) {
    await load();
    const policy=JSON.stringify({provider,model,route,enabled:config.enabled,settings:config.providers?.[provider],override:config.overrides?.[provider]?.[model]});
    const key=createHash('sha256').update(policy).digest('hex');
    const hit=records.get(key);
    if(hit && now()-hit.checkedAt < ttl)return hit;
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{
      const row={key,provider,model,status:'unknown',checkedAt:now(),routeVerified:false};
      const override=config.overrides?.[provider]?.[model];
      if(typeof override==='boolean'){Object.assign(row,{status:override?'supported':'unsupported',routeVerified:true,source:'manual override'});}
      else if(config.enabled===false){row.reason='Capability checking disabled';}
      else try {
        const officialModel=config.providers?.[provider]?.models?.[model] ?? model;
        row.officialModel=officialModel;
        const source=sourceFor(provider,officialModel);
        if(!source.url)row.reason='No supported official source or exact model mapping; no name inference';
        else {
          row.source=source.url;
          const headers={};
          if(source.mapping?.apiKeyEnv){
            const secret=await services.resolveSecret?.(source.mapping.apiKeyEnv);
            if(!secret)throw new Error('Official catalog credential unavailable');
            const hostname=new URL(source.url).hostname;
            if(hostname==='api.anthropic.com'){headers['x-api-key']=secret;headers['anthropic-version']='2023-06-01';}
            else headers.Authorization=`Bearer ${secret}`;
          }
          const body=await document(source.url,headers);
          const support=source.format==='openai'?parseOpenAI(body,officialModel):source.format==='deepseek'?parseDeepSeek(body,officialModel):parseCatalog(JSON.parse(body),officialModel);
          row.evidenceHash=createHash('sha256').update(body).digest('hex');
          if(typeof support==='boolean')row.status=support?'supported':'unsupported';else row.reason='Official response has no explicit exact-match image modality';
          // Manufacturer capability is not proof a third-party gateway transports images.
          const expectedHost=source.format==='openai'?'api.openai.com':source.format==='deepseek'?'api.deepseek.com':new URL(source.url).hostname;
          const routeUrl=typeof route.baseURL==='string'?new URL(route.baseURL):undefined;
          row.routeVerified=source.mapping?.trustGateway===true || (routeUrl?.protocol==='https:' && routeUrl.hostname===expectedHost);
          if(!row.routeVerified && row.status!=='unknown')row.reason='Manufacturer evidence only; gateway transport unverified';
        }
      }catch(error){row.reason=String(error.message).slice(0,300);}
      records.set(key,row);if(records.size>2000)records.delete(records.keys().next().value);persist();return row;
    })().finally(()=>pending.delete(key));
    pending.set(key,task);return task;
  }
  return {check,records,flush:()=>persistQueue};
}
