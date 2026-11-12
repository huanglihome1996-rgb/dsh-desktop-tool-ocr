import {createCapabilityChecker} from '../src/capabilities.mjs';
const checker=createCapabilityChecker({timeoutMs:15000});
for(const [provider,model,route] of [['deepseek','deepseek-flash',{baseURL:'https://api.deepseek.com'}],['openai','gpt-4.1',{baseURL:'https://api.openai.com/v1'}],['hth','gpt-6.1-sol-1m',{baseURL:'https://gateway.example/v1'}]]){
 const r=await checker.check(provider,model,route);console.log(JSON.stringify({provider,model,status:r.status,routeVerified:r.routeVerified,source:r.source,reason:r.reason}));
}
