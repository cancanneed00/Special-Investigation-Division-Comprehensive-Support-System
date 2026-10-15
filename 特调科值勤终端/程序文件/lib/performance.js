const fs = require('fs');
const path = require('path');
const DEFAULTS = {mode:'balanced', provider:'Auto', operationTimeoutMs:60000, pollMs:350};
function loadPerformance(root) {
  const file=path.join(root,'性能配置.json');
  const raw=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')):{};
  const p={...DEFAULTS,...raw};
  if(!['balanced','low'].includes(p.mode))throw new Error('性能配置 mode 必须为 balanced 或 low');
  if(!['Auto','CPU','DirectML'].includes(p.provider))throw new Error('性能配置 provider 必须为 Auto、CPU 或 DirectML');
  if(!Number.isFinite(p.operationTimeoutMs)||p.operationTimeoutMs<5000||p.operationTimeoutMs>120000)throw new Error('单次调用时限须为 5000–120000 毫秒');
  if(!Number.isFinite(p.pollMs)||p.pollMs<150||p.pollMs>3000)throw new Error('轮询间隔须为 150–3000 毫秒');
  if(p.mode==='low')p.pollMs=Math.max(1000,p.pollMs);
  return p;
}
function observe(session, ms) {
  const samples=session.probeSamples||(session.probeSamples=[]);
  samples.push(ms);if(samples.length>7)samples.shift();
  // A high recent quantile tolerates throttling; one cold probe cannot define the whole run.
  const sorted=[...samples].sort((a,b)=>a-b);
  const scale=Math.max(1,Math.min(8,Math.ceil(sorted[Math.floor((sorted.length-1)*0.8)]/2500)));
  session.slowScale=Math.max(session.performance?.mode==='low'?2:1,scale);
  session.peakSlowScale=Math.max(session.peakSlowScale||1,session.slowScale);
  return session.slowScale;
}
function recoveryBudget(session) {
  // Recovery spans multiple pages; a fast small-ROI probe must not erase the
  // slow recognition already observed in this session. Absolute cap: 8 minutes.
  const scale=Math.max(1,session.peakSlowScale||1,session.slowScale||1);
  return Math.min(480000,Math.max(120000,60000*scale));
}
module.exports={loadPerformance,observe,recoveryBudget};
